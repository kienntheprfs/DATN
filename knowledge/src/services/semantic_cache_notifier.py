from __future__ import annotations

import logging
from typing import Iterable

from redis import asyncio as redis
from redis.asyncio import ConnectionPool
from redis.exceptions import (
    ConnectionError as RedisConnectionError,
    TimeoutError as RedisTimeoutError,
)
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log,
)

from src.core.config import settings

logger = logging.getLogger(__name__)

REDIS_RETRY_ATTEMPTS = 3
REDIS_MAX_CONNECTIONS = 20
REDIS_SOCKET_TIMEOUT = 5
REDIS_CONNECT_TIMEOUT = 5

redis_retry = retry(
    stop=stop_after_attempt(REDIS_RETRY_ATTEMPTS),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    retry=(
        retry_if_exception_type(RedisConnectionError)
        | retry_if_exception_type(RedisTimeoutError)
    ),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)

BUMP_KB_VERSION_LUA = """
local ok, val = pcall(function()
    return redis.call('INCRBY', KEYS[1], tonumber(ARGV[1]))
end)
if ok then
    return val
end
redis.call('DEL', KEYS[1])
redis.call('SET', KEYS[1], '1')
return 1
"""


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
        self._pool: ConnectionPool | None = None

    async def _get_client(self) -> redis.Redis | None:
        if not self.enabled:
            return None
        if self._client is not None:
            return self._client
        self._pool = ConnectionPool.from_url(
            self.redis_url,
            password=self.redis_password,
            max_connections=getattr(
                settings, "SEM_CACHE_MAX_CONNECTIONS", REDIS_MAX_CONNECTIONS
            ),
            decode_responses=False,
            health_check_interval=30,
            socket_timeout=REDIS_SOCKET_TIMEOUT,
            socket_connect_timeout=REDIS_CONNECT_TIMEOUT,
        )
        self._client = redis.Redis(connection_pool=self._pool)
        return self._client

    async def close(self) -> None:
        if self._client is not None:
            try:
                await self._client.close()
                logger.info("semantic_cache_notifier_client_closed")
            except Exception:
                logger.warning("error_closing_notifier_client", exc_info=True)
            finally:
                self._client = None

        if self._pool is not None:
            try:
                await self._pool.disconnect()
                logger.info("semantic_cache_notifier_pool_disconnected")
            except Exception:
                logger.warning("error_disconnecting_notifier_pool", exc_info=True)
            finally:
                self._pool = None

    async def __aenter__(self) -> "SemanticCacheNotifier":
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        await self.close()

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
            result = await client.evalsha(
                client.script_load(BUMP_KB_VERSION_LUA),
                1,
                key,
                "1",
            )
            return int(result)
        except Exception:
            try:
                result = await client.eval(
                    BUMP_KB_VERSION_LUA,
                    1,
                    key,
                    "1",
                )
                return int(result)
            except Exception:
                logger.error(
                    "notifier_failed_to_bump_kb_version key=%s — falling back to set",
                    key,
                    exc_info=True,
                )
                try:
                    await client.set(key, b"1")
                except Exception:
                    logger.error(
                        "notifier_failed_to_reset_kb_version key=%s", key, exc_info=True
                    )
                return 1

    async def invalidate_doc_ids(
        self, *, namespace: str, doc_ids: Iterable[str]
    ) -> int:
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
                logger.warning(
                    "notifier_failed_to_get_doc_set_members set_key=%s",
                    set_key,
                    exc_info=True,
                )
                continue
            if not members:
                try:
                    await client.delete(set_key)
                except Exception:
                    logger.warning(
                        "notifier_failed_to_delete_empty_set_key set_key=%s",
                        set_key,
                        exc_info=True,
                    )
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
                    logger.info(
                        "notifier_invalidated_doc_ids doc_id=%s deleted_keys=%d",
                        doc_id,
                        len(keys),
                    )
                except Exception:
                    logger.error(
                        "notifier_failed_to_delete_cache_keys doc_id=%s key_count=%d",
                        doc_id,
                        len(keys),
                        exc_info=True,
                    )
            try:
                await client.delete(set_key)
            except Exception:
                logger.warning(
                    "notifier_failed_to_delete_set_key set_key=%s",
                    set_key,
                    exc_info=True,
                )
        return deleted

    async def notify_kb_changed(
        self, *, namespace: str, doc_ids: Iterable[str] | None = None
    ) -> int:
        """
        Best-practice invalidation pattern:
        - targeted delete by doc_id reverse index (if we know which doc changed)
        - bump kb version so remaining entries are treated stale
        """
        if doc_ids:
            await self.invalidate_doc_ids(namespace=namespace, doc_ids=doc_ids)
        return await self.bump_kb_version(namespace=namespace)


semantic_cache_notifier = SemanticCacheNotifier()
