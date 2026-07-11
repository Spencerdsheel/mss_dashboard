from __future__ import annotations

import asyncio
import json
import time
from typing import Any, Callable, Awaitable

import redis.asyncio as aioredis

from services.api.metrics import cache_hits_total, cache_misses_total
from services.common.logging_config import get_logger

logger = get_logger(__name__)

# Bound on the tenant key-tracking SET's own TTL — self-healing in case a
# tenant is never explicitly invalidated (e.g. dev environments).
_TENANT_KEY_SET_TTL = 86400
# Single-flight lock TTL for background SWR refreshes.
_REFRESH_LOCK_TTL = 30


class CacheAside:
    """Redis-backed cache-aside pattern for expensive API endpoints.

    Supports both the plain get/set API (bare JSON values) and a
    stale-while-revalidate (SWR) API that stores a small envelope
    `{"v": value, "soft": unix_ts}` so warm requests never block on the DB:
    a request past the soft TTL is served the (still fresh-enough) stale
    value immediately while a single background task refreshes it.
    """

    def __init__(self, redis_url: str | None = None, default_ttl: int = 300):
        self._redis: aioredis.Redis | None = None
        self._redis_url = redis_url
        self._default_ttl = default_ttl

    async def _get_client(self) -> aioredis.Redis | None:
        if self._redis is None and self._redis_url:
            try:
                self._redis = aioredis.from_url(
                    self._redis_url,
                    decode_responses=True,
                    socket_connect_timeout=2,
                )
                await self._redis.ping()
            except Exception:
                logger.warning("Redis unavailable, cache disabled")
                self._redis = None
        return self._redis

    async def get(self, key: str, endpoint: str = "unknown") -> Any | None:
        client = await self._get_client()
        if client is None:
            return None
        try:
            raw = await client.get(key)
            if raw is None:
                cache_misses_total.labels(endpoint=endpoint).inc()
                return None
            cache_hits_total.labels(endpoint=endpoint).inc()
            return json.loads(raw)
        except Exception as exc:
            logger.warning(f"Cache get error: {exc}")
            return None

    async def set(self, key: str, value: Any, ttl: int | None = None, tenant_id: str | None = None) -> None:
        client = await self._get_client()
        if client is None:
            return
        try:
            if tenant_id:
                pipe = client.pipeline()
                pipe.set(key, json.dumps(value), ex=ttl or self._default_ttl)
                pipe.sadd(f"t:{tenant_id}:keys", key)
                pipe.expire(f"t:{tenant_id}:keys", _TENANT_KEY_SET_TTL)
                await pipe.execute()
            else:
                await client.set(key, json.dumps(value), ex=ttl or self._default_ttl)
        except Exception as exc:
            logger.warning(f"Cache set error: {exc}")

    async def delete(self, key: str) -> None:
        client = await self._get_client()
        if client is None:
            return
        try:
            await client.delete(key)
        except Exception as exc:
            logger.warning(f"Cache delete error: {exc}")

    async def delete_pattern(self, pattern: str) -> None:
        """Delete all keys matching a glob pattern.

        Retained for backward compatibility; new invalidation call sites
        should use `invalidate_tenant` (set-based, no SCAN) instead.
        """
        client = await self._get_client()
        if client is None:
            return
        try:
            cursor = 0
            while True:
                cursor, keys = await client.scan(cursor=cursor, match=pattern, count=100)
                if keys:
                    await client.delete(*keys)
                if cursor == 0:
                    break
        except Exception as exc:
            logger.warning(f"Cache delete_pattern error: {exc}")

    # ── Tenant-namespaced tracked-key invalidation ──────────────────────────

    async def invalidate_tenant(self, tenant_id: str) -> None:
        """Delete every cache key registered for *tenant_id*, plus the tracking set.

        Set-based — O(keys for this tenant), never a full-keyspace SCAN.
        """
        client = await self._get_client()
        if client is None:
            return
        try:
            set_key = f"t:{tenant_id}:keys"
            keys = await client.smembers(set_key)
            if keys:
                await client.delete(*keys)
            await client.delete(set_key)
        except Exception as exc:
            logger.warning(f"Cache invalidate_tenant error: {exc}")

    # ── Stale-while-revalidate ───────────────────────────────────────────────

    async def set_swr(
        self,
        key: str,
        value: Any,
        soft_ttl: int,
        hard_ttl: int,
        tenant_id: str,
    ) -> None:
        envelope = {"v": value, "soft": time.time() + soft_ttl}
        await self._raw_set(key, envelope, hard_ttl, tenant_id)

    async def _raw_set(self, key: str, envelope: dict, hard_ttl: int, tenant_id: str) -> None:
        client = await self._get_client()
        if client is None:
            return
        try:
            pipe = client.pipeline()
            pipe.set(key, json.dumps(envelope), ex=hard_ttl)
            pipe.sadd(f"t:{tenant_id}:keys", key)
            pipe.expire(f"t:{tenant_id}:keys", _TENANT_KEY_SET_TTL)
            await pipe.execute()
        except Exception as exc:
            logger.warning(f"Cache set_swr error: {exc}")

    async def get_swr(
        self,
        key: str,
        *,
        endpoint: str,
        refresh: Callable[[], Awaitable[Any]],
        soft_ttl: int,
        hard_ttl: int,
        tenant_id: str,
    ) -> Any:
        """Fetch *key* with stale-while-revalidate semantics.

        - Cold miss: block on `refresh()` (caller pays the latency once),
          populate the cache, return the fresh value. A DB error here
          propagates (red line #2: no silent fallback on a cold miss).
        - Warm hit, still fresh (`soft` in the future): return immediately.
        - Warm hit, stale (`soft` in the past): return the stale value
          immediately and kick off exactly one background refresh
          (single-flight via `SET NX` lock) so a burst of concurrent
          requests doesn't stampede the DB.
        """
        client = await self._get_client()
        if client is None:
            # No cache available — always compute fresh. This still must
            # raise on failure, never return a silent empty fallback.
            return await refresh()

        raw = await self.get(key, endpoint=endpoint)
        if raw is None:
            value = await refresh()
            await self.set_swr(key, value, soft_ttl, hard_ttl, tenant_id)
            return value

        if not isinstance(raw, dict) or "v" not in raw or "soft" not in raw:
            # Legacy/foreign envelope shape — treat as a miss and refresh.
            value = await refresh()
            await self.set_swr(key, value, soft_ttl, hard_ttl, tenant_id)
            return value

        if raw["soft"] < time.time():
            lock_key = f"{key}:lock"
            try:
                got_lock = await client.set(lock_key, "1", nx=True, ex=_REFRESH_LOCK_TTL)
            except Exception as exc:
                logger.warning(f"Cache SWR lock error: {exc}")
                got_lock = False
            if got_lock:
                asyncio.create_task(
                    self._refresh_and_store(key, refresh, soft_ttl, hard_ttl, tenant_id, lock_key)
                )
        return raw["v"]

    async def _refresh_and_store(
        self,
        key: str,
        refresh: Callable[[], Awaitable[Any]],
        soft_ttl: int,
        hard_ttl: int,
        tenant_id: str,
        lock_key: str,
    ) -> None:
        """Background SWR refresh. Must never let an exception escape —
        this runs detached from any request, so a failure here must be
        swallowed and logged rather than surfaced to a caller."""
        client = await self._get_client()
        try:
            value = await refresh()
            await self.set_swr(key, value, soft_ttl, hard_ttl, tenant_id)
        except Exception as exc:
            logger.warning(f"Background SWR refresh failed for {key}: {exc}")
        finally:
            if client is not None:
                try:
                    await client.delete(lock_key)
                except Exception:
                    pass
