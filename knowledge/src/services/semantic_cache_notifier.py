from __future__ import annotations

import logging
from typing import Iterable

from redis import asyncio as redis

from src.core.config import settings

logger = logging.getLogger(__name__)


class SemanticCacheNotifier:
    """
    Cross-service cache invalidation helper.

    The semantic cache lives in agent-service-toolkit, but the KB mutation events
    (upload/delete/re-index) happen in this `knowledge` service.

    We coordinate via Redis using shared key conventions:
    - KB version: f"{SEM_CACHE_KB_VERSION_KEY_PREFIX}:{namespace}"
    - Doc reverse index sets: f"{SEM_CACHE_DOC_SET_PREFIX}:{namespace}:{doc_id}" -> {cache_keys}
    """

    def __init__(self) -> None:
        self.enabled = bool(settings.SEM_CACHE_REDIS_URL)
        self.redis_url = settings.SEM_CACHE_REDIS_URL
        self.redis_password = settings.SEM_CACHE_REDIS_PASSWORD
        self.kb_version_key_prefix = settings.SEM_CACHE_KB_VERSION_KEY_PREFIX
        self.doc_set_prefix = settings.SEM_CACHE_DOC_SET_PREFIX
        self.ttl_seconds = settings.SEM_CACHE_TTL_SECONDS
        self._client: redis.Redis | None = None

    async def _get_client(self) -> redis.Redis | None:
        if not self.enabled:
            return None
        if self._client is not None:
            return self._client
        self._client = redis.from_url(
            self.redis_url,
            password=self.redis_password,
            decode_responses=False,
            health_check_interval=30,
            socket_timeout=5,
            socket_connect_timeout=5,
        )
        return self._client

    def _kb_version_key(self, namespace: str) -> str:
        return f"{self.kb_version_key_prefix}:{namespace}"

    def _doc_set_key(self, namespace: str, doc_id: str) -> str:
        return f"{self.doc_set_prefix}:{namespace}:{doc_id}"

    async def bump_kb_version(self, *, namespace: str) -> int:
        client = await self._get_client()
        if client is None:
            return 1
        key = self._kb_version_key(namespace)
        try:
            return int(await client.incr(key))
        except Exception:
            await client.set(key, b"1")
            return 1

    async def invalidate_doc_ids(self, *, namespace: str, doc_ids: Iterable[str]) -> int:
        client = await self._get_client()
        if client is None:
            return 0

        deleted = 0
        for raw in doc_ids:
            doc_id = str(raw).strip()
            if not doc_id:
                continue
            set_key = self._doc_set_key(namespace, doc_id)
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
                    pass
            await client.delete(set_key)
        return deleted

    async def notify_kb_changed(self, *, namespace: str, doc_ids: Iterable[str] | None = None) -> int:
        """
        Best-practice invalidation pattern:
        - targeted delete by doc_id reverse index (if we know which doc changed)
        - bump kb version so remaining entries are treated stale
        """
        if doc_ids:
            await self.invalidate_doc_ids(namespace=namespace, doc_ids=doc_ids)
        return await self.bump_kb_version(namespace=namespace)


semantic_cache_notifier = SemanticCacheNotifier()

