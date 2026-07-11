from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter

from services.api.dependencies import get_repository
from services.common.postgres_repository import PostgresDashboardRepository
from services.common.settings import load_settings

router = APIRouter(tags=["health"])
logger = logging.getLogger(__name__)

START_TIME = datetime.now(timezone.utc)


@router.get("/healthz")
async def health_check() -> dict:
    """Basic liveness check - is the process running?"""
    uptime_seconds = (datetime.now(timezone.utc) - START_TIME).total_seconds()
    return {
        "status": "ok",
        "service": "shopmetrics-dashboard-api",
        "uptime_seconds": int(uptime_seconds),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/readyz")
async def readiness_check() -> dict:
    """Readiness check - are all dependencies available?

    Task 2.9: checks go through the shared application pool/repository
    instead of opening a fresh asyncpg connection per request — under load
    (100+ concurrent readiness probes from an orchestrator) a fresh
    connection per check is itself a connection-exhaustion risk, and it
    bypasses PgBouncer sizing assumptions. Also checks Redis, since JWT
    revocation, rate limiting, caching, and Celery all depend on it.
    """
    settings = load_settings()
    status = {"status": "ok", "checks": {}, "timestamp": datetime.now(timezone.utc).isoformat()}

    # Database — via the shared pool, never a fresh connection.
    try:
        repository = get_repository()
        if isinstance(repository, PostgresDashboardRepository):
            if repository.pool is None:
                raise RuntimeError("pool not initialized")
            async with repository.pool.acquire() as conn:
                await conn.fetchval("SELECT 1")
            status["checks"]["database"] = "ok"
        else:
            status["checks"]["database"] = "memory"
    except Exception as exc:
        logger.warning("Readiness: database check failed: %s", exc)
        status["checks"]["database"] = "error"
        status["status"] = "degraded"

    # Redis — JWT revocation, rate limiting, cache, Celery broker all depend on it.
    if settings.redis_url:
        try:
            import redis.asyncio as aioredis

            client = aioredis.from_url(settings.redis_url, socket_connect_timeout=2)
            await client.ping()
            await client.aclose()
            status["checks"]["redis"] = "ok"
        except Exception as exc:
            logger.warning("Readiness: redis check failed: %s", exc)
            status["checks"]["redis"] = "error"
            status["status"] = "degraded"
    else:
        status["checks"]["redis"] = "not_configured"

    return status
