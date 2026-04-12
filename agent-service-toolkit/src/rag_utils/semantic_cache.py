import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import numpy as np
from redis import asyncio as redis
from redis.exceptions import ResponseError

from core.settings import settings

logger = logging.getLogger(__name__)


@dataclass
class SemanticCacheHit:
    response_text: str
    artifacts: list[dict[str, Any]]
    similarity: float
    cache_key: str
    kb_version: int


class SemanticCacheService:
    def __init__(self) -> None:
        self.enabled = settings.SEM_CACHE_ENABLED and bool(settings.SEM_CACHE_REDIS_URL)
        self.index_name = settings.SEM_CACHE_INDEX_NAME
        self.key_prefix = settings.SEM_CACHE_KEY_PREFIX
        self.kb_version_key = settings.SEM_CACHE_KB_VERSION_KEY
        self.kb_version_key_prefix = settings.SEM_CACHE_KB_VERSION_KEY_PREFIX
        self.namespace = settings.SEM_CACHE_NAMESPACE
        self.doc_set_prefix = settings.SEM_CACHE_DOC_SET_PREFIX
        self.min_score = settings.SEM_CACHE_MIN_SCORE
        self.top_k = settings.SEM_CACHE_TOP_K
        self.ttl_seconds = settings.SEM_CACHE_TTL_SECONDS
        self.vector_dim = settings.SEM_CACHE_VECTOR_DIM
        self._index_ready: set[str] = set()
        self._client: redis.Redis | None = None

    async def _get_client(self) -> redis.Redis | None:
        if not self.enabled:
            return None
        if self._client is not None:
            return self._client

        self._client = redis.from_url(
            settings.SEM_CACHE_REDIS_URL or "",
            password=settings.SEM_CACHE_REDIS_PASSWORD,
            decode_responses=False,
            health_check_interval=30,
            socket_timeout=5,
            socket_connect_timeout=5,
        )
        return self._client

    def _normalize_namespace(self, namespace: str | None) -> str:
        ns = (namespace or self.namespace).strip()
        return ns or self.namespace

    def _index_name_for(self, namespace: str | None) -> str:
        ns = self._normalize_namespace(namespace)
        return f"{self.index_name}:{ns}"

    def _cache_key_prefix_for(self, namespace: str | None) -> str:
        ns = self._normalize_namespace(namespace)
        return f"{self.key_prefix}:{ns}:"

    async def _ensure_index(self, *, namespace: str | None = None) -> None:
        index_name = self._index_name_for(namespace)
        if index_name in self._index_ready:
            return

        client = await self._get_client()
        if client is None:
            return

        try:
            await client.execute_command(
                "FT.CREATE",
                index_name,
                "ON",
                "HASH",
                "PREFIX",
                "1",
                self._cache_key_prefix_for(namespace),
                "SCHEMA",
                "query_mode",
                "TAG",
                "kb_version",
                "NUMERIC",
                "dense_vector",
                "VECTOR",
                "HNSW",
                "6",
                "TYPE",
                "FLOAT32",
                "DIM",
                str(self.vector_dim),
                "DISTANCE_METRIC",
                "COSINE",
            )
            logger.info("semantic_cache_index_created index=%s", index_name)
        except ResponseError as e:
            if "Index already exists" not in str(e):
                raise
        self._index_ready.add(index_name)

    @staticmethod
    def _to_vector_bytes(dense_vector: list[float]) -> bytes:
        return np.array(dense_vector, dtype=np.float32).tobytes()

    def _kb_version_key_for(self, namespace: str | None) -> str:
        ns = (namespace or self.namespace).strip()
        if not ns:
            ns = self.namespace
        # Prefer per-namespace versioning; fallback to legacy global key for backward compatibility.
        if self.kb_version_key_prefix:
            return f"{self.kb_version_key_prefix}:{ns}"
        return self.kb_version_key

    def _doc_set_key(self, *, namespace: str | None, doc_id: str) -> str:
        ns = self._normalize_namespace(namespace)
        return f"{self.doc_set_prefix}:{ns}:{doc_id}"

    @staticmethod
    def _extract_doc_ids(artifacts: list[dict[str, Any]]) -> list[str]:
        doc_ids: list[str] = []
        for a in artifacts or []:
            if not isinstance(a, dict):
                continue
            raw = a.get("doc_id")
            if raw is None:
                continue
            s = str(raw).strip()
            if s:
                doc_ids.append(s)
        # De-dup while preserving order
        seen: set[str] = set()
        out: list[str] = []
        for d in doc_ids:
            if d in seen:
                continue
            seen.add(d)
            out.append(d)
        return out

    async def get_kb_version(self, *, namespace: str | None = None) -> int:
        client = await self._get_client()
        if client is None:
            return 1
        key = self._kb_version_key_for(namespace)
        raw = await client.get(key)
        if raw is None:
            await client.set(key, "1")
            return 1
        try:
            if isinstance(raw, bytes):
                return int(raw.decode("utf-8"))
            return int(raw)
        except Exception:
            return 1

    async def bump_kb_version(self, *, namespace: str | None = None, by: int = 1) -> int:
        client = await self._get_client()
        if client is None:
            return 1
        key = self._kb_version_key_for(namespace)
        try:
            return int(await client.incrby(key, by))
        except Exception:
            # If incr fails due to bad type/value, reset to 1
            await client.set(key, "1")
            return 1

    async def invalidate_by_doc_ids(
        self,
        *,
        namespace: str | None = None,
        doc_ids: list[str],
    ) -> int:
        """
        Invalidate semantic cache entries that were generated using any of the provided doc_ids.

        This uses reverse-index Redis sets (doc_id -> {cache_keys}) so we don't need to scan the DB
        or depend on RediSearch schema changes.
        """
        client = await self._get_client()
        if client is None:
            return 0

        deleted = 0
        for doc_id in (doc_ids or []):
            d = str(doc_id).strip()
            if not d:
                continue
            set_key = self._doc_set_key(namespace=namespace, doc_id=d)
            try:
                members = await client.smembers(set_key)
            except Exception:
                continue
            if not members:
                await client.delete(set_key)
                continue

            keys: list[str] = []
            for m in members:
                if isinstance(m, bytes):
                    s = m.decode("utf-8", errors="ignore")
                else:
                    s = str(m)
                if s:
                    keys.append(s)

            if keys:
                try:
                    deleted += int(await client.delete(*keys))
                except Exception:
                    # best-effort; continue
                    pass
            await client.delete(set_key)
        return deleted

    async def notify_kb_changed(
        self,
        *,
        namespace: str | None = None,
        doc_ids: list[str] | None = None,
    ) -> int:
        """
        Industry-style invalidation on KB mutation:
        - Drop cache entries that reference changed documents (if doc_ids provided)
        - Bump KB version so any remaining entries are logically stale
        """
        ns = namespace or self.namespace
        if doc_ids:
            await self.invalidate_by_doc_ids(namespace=ns, doc_ids=doc_ids)
        return await self.bump_kb_version(namespace=ns, by=1)

    async def search(
        self,
        *,
        dense_vector: list[float],
        query_mode: str,
        kb_version: int,
        namespace: str | None = None,
    ) -> SemanticCacheHit | None:
        client = await self._get_client()
        if client is None:
            return None

        await self._ensure_index(namespace=namespace)
        query_bytes = self._to_vector_bytes(dense_vector)
        normalized_mode = query_mode.strip().lower()
        index_name = self._index_name_for(namespace)
        query = (
            f"(@query_mode:{{{normalized_mode}}} @kb_version:[{kb_version} {kb_version}])"
            f"=>[KNN {self.top_k} @dense_vector $vec AS vector_distance]"
        )

        result = await client.execute_command(
            "FT.SEARCH",
            index_name,
            query,
            "PARAMS",
            "2",
            "vec",
            query_bytes,
            "SORTBY",
            "vector_distance",
            "RETURN",
            "6",
            "response_text",
            "artifacts_json",
            "query_text",
            "query_mode",
            "kb_version",
            "vector_distance",
            "DIALECT",
            "2",
        )

        if not result or result[0] == 0:
            logger.info(
                "semantic_cache_no_candidate mode=%s kb_version=%s top_k=%s",
                normalized_mode,
                kb_version,
                self.top_k,
            )
            return None

        fields = result[2]
        field_map: dict[str, Any] = {}
        for i in range(0, len(fields), 2):
            key = fields[i].decode("utf-8") if isinstance(fields[i], bytes) else str(fields[i])
            value = fields[i + 1]
            if isinstance(value, bytes):
                value = value.decode("utf-8")
            field_map[key] = value

        distance = float(field_map.get("vector_distance", 1.0))
        similarity = 1.0 - distance
        if similarity < self.min_score:
            logger.info(
                "semantic_cache_below_threshold similarity=%.4f threshold=%.4f mode=%s kb_version=%s",
                similarity,
                self.min_score,
                normalized_mode,
                kb_version,
            )
            return None

        artifacts = []
        artifacts_raw = field_map.get("artifacts_json")
        if artifacts_raw:
            try:
                artifacts = json.loads(artifacts_raw)
            except Exception:
                artifacts = []

        cache_key_raw = result[1]
        cache_key = cache_key_raw.decode("utf-8") if isinstance(cache_key_raw, bytes) else str(cache_key_raw)

        await client.hincrby(cache_key, "hit_count", 1)
        await client.hset(
            cache_key,
            mapping={"last_hit_at": datetime.now(timezone.utc).isoformat()},
        )
        await client.expire(cache_key, self.ttl_seconds)

        return SemanticCacheHit(
            response_text=field_map.get("response_text", ""),
            artifacts=artifacts if isinstance(artifacts, list) else [],
            similarity=similarity,
            cache_key=cache_key,
            kb_version=kb_version,
        )

    async def upsert(
        self,
        *,
        query_text: str,
        response_text: str,
        artifacts: list[dict[str, Any]],
        dense_vector: list[float],
        query_mode: str,
        kb_version: int,
        namespace: str | None = None,
    ) -> None:
        client = await self._get_client()
        if client is None:
            return
        await self._ensure_index(namespace=namespace)

        now = datetime.now(timezone.utc).isoformat()
        ns = self._normalize_namespace(namespace)
        key = f"{self.key_prefix}:{ns}:{uuid4()}"

        normalized_mode = query_mode.strip().lower()
        doc_ids = self._extract_doc_ids(artifacts)
        payload = {
            "query_text": query_text,
            "response_text": response_text,
            "artifacts_json": json.dumps(artifacts, ensure_ascii=False),
            "dense_vector": self._to_vector_bytes(dense_vector),
            "created_at": now,
            "last_hit_at": now,
            "hit_count": 0,
            "kb_version": kb_version,
            "query_mode": normalized_mode,
        }
        await client.hset(key, mapping=payload)
        await client.expire(key, self.ttl_seconds)

        # Reverse index: doc_id -> set(cache_keys). Best-effort to support targeted invalidation.
        if doc_ids:
            for doc_id in doc_ids:
                set_key = self._doc_set_key(namespace=ns, doc_id=doc_id)
                try:
                    await client.sadd(set_key, key)
                    # Keep set alive at least as long as cache TTL
                    await client.expire(set_key, self.ttl_seconds)
                except Exception:
                    # best-effort
                    pass


semantic_cache_service = SemanticCacheService()
