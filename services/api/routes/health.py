from __future__ import annotations

import time
from datetime import datetime, timezone

import asyncpg
from fastapi import APIRouter, Depends

from services.common.settings import Settings, load_settings

router = APIRouter(tags=["health"])

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
    """Readiness check - are all dependencies available?"""
    settings = load_settings()
    status = {"status": "ok", "checks": {}, "timestamp": datetime.now(timezone.utc).isoformat()}

    # Check database connection
    try:
        conn = await asyncpg.connect(dsn=settings.database_url, timeout=5)
        await conn.fetchval("SELECT 1")
        await conn.close()
        status["checks"]["database"] = "ok"
    except Exception as e:
        status["checks"]["database"] = f"error: {str(e)}"
        status["status"] = "degraded"

    return status
