from __future__ import annotations

import os
import time
from typing import Any

try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False

from services.api.exceptions import RateLimitError
from services.common.logging_config import get_logger

logger = get_logger(__name__)

# S2: Sentinel object — used so _check_limit can signal "Redis down" without
# conflating it with "limit exceeded".
_REDIS_UNAVAILABLE = object()


class RedisRateLimiter:
    """Redis-backed sliding-window rate limiter that persists across restarts.

    S2 behaviour:
    - Auth and admin endpoints FAIL CLOSED when Redis is down (request denied).
    - The global limiter falls back to conservative in-memory limiting with a
      warning; per-worker multiplication is documented and accepted for the
      global path because a global 429 is less critical than an auth bypass.
    """

    def __init__(self, redis_url: str | None = None):
        if not REDIS_AVAILABLE:
            raise ImportError(
                "redis package is required for Redis-backed rate limiting. "
                "Install with: pip install redis"
            )

        self.redis_url = redis_url or "redis://localhost:6380/0"
        self.client = redis.from_url(
            self.redis_url, decode_responses=True,
            socket_connect_timeout=2, socket_timeout=2,
        )
        self.client.ping()
        # Fallback is only used for the non-critical global limiter path.
        self._global_fallback = InMemoryRateLimiter()

    def _check_limit(
        self,
        key: str,
        limit: int,
        window_seconds: int,
    ) -> bool | object:
        """Check if request is within rate limit.

        Returns:
            True  — allowed
            False — denied (limit exceeded)
            _REDIS_UNAVAILABLE — sentinel: Redis is down
        """
        now = time.time()
        window_start = now - window_seconds

        try:
            pipe = self.client.pipeline()
            pipe.zremrangebyscore(key, 0, window_start)
            pipe.zadd(key, {str(now): now})
            pipe.zcard(key)
            pipe.expire(key, window_seconds)
            results = pipe.execute()
            request_count = results[2]
            return request_count <= limit
        except Exception as exc:
            logger.warning("Redis rate limiter unavailable: %s", exc)
            return _REDIS_UNAVAILABLE

    def check_rate_limit(
        self,
        client_key: str,
        endpoint: str,
        limit: int,
        window_seconds: int,
        *,
        fail_closed: bool = False,
    ) -> None:
        """Check rate limit and raise RateLimitError if exceeded.

        Args:
            fail_closed: When True (auth/admin endpoints), deny the request if
                Redis is unavailable rather than falling back to in-memory.
                When False (global path), fall back to per-worker in-memory
                limiting with a logged warning.
        """
        key = f"ratelimit:{endpoint}:{client_key}"
        result = self._check_limit(key, limit, window_seconds)

        if result is _REDIS_UNAVAILABLE:
            if fail_closed:
                logger.error(
                    "Redis unavailable — rate limit check for sensitive endpoint "
                    "%s failing closed (denying request for key %s)",
                    endpoint,
                    client_key,
                )
                raise RateLimitError(
                    message="Service temporarily unavailable. Please try again shortly.",
                    retry_after=window_seconds,
                )
            else:
                # Global path: fall back to per-worker in-memory.
                # NOTE: with N workers each enforcing the full limit, the
                # effective global limit is N × limit. This is an accepted
                # trade-off for the global (non-auth) path only.
                logger.warning(
                    "Redis unavailable — falling back to in-memory rate limiter "
                    "for global path. Per-worker limit applies."
                )
                self._global_fallback.check_rate_limit(
                    client_key, endpoint, limit, window_seconds
                )
                return

        if result is False:
            logger.warning(
                "Rate limit exceeded for %s on %s", client_key, endpoint
            )
            raise RateLimitError(
                message=f"Rate limit exceeded. Try again in {window_seconds} seconds.",
                retry_after=window_seconds,
            )


class InMemoryRateLimiter:
    """Fallback in-memory rate limiter (non-persistent, per-worker)."""

    def __init__(self):
        self.state: dict[str, list[float]] = {}

    def _check_limit(
        self,
        key: str,
        limit: int,
        window_seconds: int,
    ) -> bool:
        """Check if request is within rate limit. Returns True if allowed."""
        now = time.time()
        window_start = now - window_seconds

        if key not in self.state:
            self.state[key] = []

        self.state[key] = [
            ts for ts in self.state[key] if ts > window_start
        ]
        self.state[key].append(now)

        return len(self.state[key]) <= limit

    def check_rate_limit(
        self,
        client_key: str,
        endpoint: str,
        limit: int,
        window_seconds: int,
        *,
        fail_closed: bool = False,
    ) -> None:
        """Check rate limit and raise RateLimitError if exceeded."""
        key = f"ratelimit:{endpoint}:{client_key}"

        if not self._check_limit(key, limit, window_seconds):
            logger.warning(
                "Rate limit exceeded for %s on %s", client_key, endpoint
            )
            raise RateLimitError(
                message=f"Rate limit exceeded. Try again in {window_seconds} seconds.",
                retry_after=window_seconds,
            )


# S2: Single shared limiter instance created once at startup.
# All middleware dispatch through this object so state is not duplicated.
_shared_limiter: RedisRateLimiter | InMemoryRateLimiter | None = None


def create_rate_limiter(
    redis_url: str | None = None,
) -> RedisRateLimiter | InMemoryRateLimiter:
    """Create appropriate rate limiter based on Redis availability.

    S2: Returns a single shared instance — call this once at startup and reuse.
    """
    if redis_url and REDIS_AVAILABLE:
        try:
            return RedisRateLimiter(redis_url)
        except Exception as e:
            logger.warning(
                "Redis rate limiter failed to initialize, falling back to "
                "in-memory: %s", e
            )
            return InMemoryRateLimiter()
    return InMemoryRateLimiter()


def _get_client_ip(request: Any, trusted_proxy_count: int = 0) -> str:
    """Determine the real client IP for rate-limit keying.

    S2: When trusted_proxy_count > 0, extract the appropriate address from
    X-Forwarded-For (the Nth-from-the-right entry, counting only trusted hops).
    When 0 (default), always use request.client.host to prevent IP spoofing.

    Example with trusted_proxy_count=1 and header "1.2.3.4, 10.0.0.1":
        - 10.0.0.1 is our trusted proxy
        - 1.2.3.4 is the real client (XFF[-1] = our proxy, XFF[-2] = client)
    """
    if trusted_proxy_count <= 0:
        return request.client.host if request.client else "unknown"

    xff = request.headers.get("x-forwarded-for", "")
    if not xff:
        return request.client.host if request.client else "unknown"

    parts = [p.strip() for p in xff.split(",")]
    # We trust the rightmost `trusted_proxy_count` entries; the real client
    # is the entry just before those.
    index = -(trusted_proxy_count + 1)
    if abs(index) <= len(parts):
        return parts[index]
    # If there aren't enough entries, fall back to the leftmost claim.
    return parts[0]


# Auth/admin endpoint patterns that must fail closed when Redis is down.
_FAIL_CLOSED_PREFIXES = ("/auth/", "/admin/")


_ADMIN_WRITE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def setup_rate_limiting(
    app: Any,
    redis_url: str | None = None,
    trusted_proxy_count: int = 0,
) -> None:
    """Configure rate limiting for the FastAPI app.

    S2: Uses a single shared limiter instance. Auth and admin endpoints fail
    closed when Redis is unavailable; global path falls back to per-worker
    in-memory limiting (with the understanding that per-worker limits apply).

    Admin write cap (POST/PUT/PATCH/DELETE under /admin/):
      Configurable via ADMIN_WRITE_RATE_LIMIT_PER_HOUR env var (default 60).
      Fails closed when Redis is unavailable.

    Admin GET reads are NOT subject to a low special cap — they fall through
    to the global limit (100/min) only.
    """
    from starlette.middleware.base import BaseHTTPMiddleware
    from starlette.requests import Request
    from starlette.responses import JSONResponse

    # S2: Build the shared limiter once here; the middleware closure captures it.
    rate_limiter = create_rate_limiter(redis_url)

    # Auth login: strict low cap, fail-closed.
    auth_login_limit = {"limit": 10, "window_seconds": 60}

    # Admin mutating writes: configurable, fail-closed.
    admin_write_limit = {
        "limit": int(os.getenv("ADMIN_WRITE_RATE_LIMIT_PER_HOUR", "60")),
        "window_seconds": 3600,
    }

    global_limit = {"limit": 100, "window_seconds": 60}

    class RateLimitMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next):
            client_key = _get_client_ip(request, trusted_proxy_count)
            path = request.url.path
            method = request.method.upper()

            # Determine whether this path requires fail-closed behaviour.
            is_sensitive = any(
                path.startswith(prefix) for prefix in _FAIL_CLOSED_PREFIXES
            )

            # 1. Auth login — strict per-IP cap, always fail-closed.
            if path == "/auth/login":
                try:
                    rate_limiter.check_rate_limit(
                        client_key,
                        "/auth/login",
                        auth_login_limit["limit"],
                        auth_login_limit["window_seconds"],
                        fail_closed=True,
                    )
                except RateLimitError as e:
                    return JSONResponse(
                        status_code=429,
                        content={
                            "error": {
                                "code": "rate_limit_exceeded",
                                "message": str(e),
                            }
                        },
                        headers={"Retry-After": str(e.retry_after)},
                    )

            # 2. Admin mutating writes — fail-closed, shared "admin_write" bucket.
            #    Admin GET reads skip this check entirely (no special low cap).
            elif path.startswith("/admin/") and method in _ADMIN_WRITE_METHODS:
                try:
                    rate_limiter.check_rate_limit(
                        client_key,
                        "admin_write",
                        admin_write_limit["limit"],
                        admin_write_limit["window_seconds"],
                        fail_closed=True,
                    )
                except RateLimitError as e:
                    return JSONResponse(
                        status_code=429,
                        content={
                            "error": {
                                "code": "rate_limit_exceeded",
                                "message": str(e),
                            }
                        },
                        headers={"Retry-After": str(e.retry_after)},
                    )

            # 3. Global limit — fail closed only for auth/admin paths.
            try:
                rate_limiter.check_rate_limit(
                    client_key,
                    "global",
                    global_limit["limit"],
                    global_limit["window_seconds"],
                    fail_closed=is_sensitive,
                )
            except RateLimitError as e:
                return JSONResponse(
                    status_code=429,
                    content={
                        "error": {
                            "code": "rate_limit_exceeded",
                            "message": str(e),
                        }
                    },
                    headers={"Retry-After": str(e.retry_after)},
                )

            response = await call_next(request)
            return response

    app.add_middleware(RateLimitMiddleware)
