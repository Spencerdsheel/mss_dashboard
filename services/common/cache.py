from __future__ import annotations

import json
from typing import Any, Callable, Awaitable

import redis.asyncio as aioredis

from services.api.metrics import cache_hits_total, cache_misses_total
from services.common.logging_config import get_logger

logger = get_logger(__name__)


class CacheAside:
    """Redis-backed cache-aside pattern for expensive API endpoints."""

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

    async def set(self, key: str, value: Any, ttl: int | None = None) -> None:
        client = await self._get_client()
        if client is None:
            return
        try:
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
        """Delete all keys matching a glob pattern."""
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


def cached_endpoint(
    cache: CacheAside,
    key_builder: Callable[..., str],
    ttl: int = 300,
):
    """Decorator to add cache-aside behavior to FastAPI endpoint functions.

    Usage:
        @router.get("/projects/{id}/summary")
        @cached_endpoint(cache, lambda project_id: f"summary:{project_id}", ttl=300)
        async def get_summary(project_id: str):
            ...
    """
    def decorator(func: Callable[..., Awaitable[Any]]) -> Callable[..., Awaitable[Any]]:
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            key = key_builder(*args, **kwargs)
            cached = await cache.get(key)
            if cached is not None:
                return cached
            result = await func(*args, **kwargs)
            await cache.set(key, result, ttl)
            return result
        return wrapper
    return decorator
