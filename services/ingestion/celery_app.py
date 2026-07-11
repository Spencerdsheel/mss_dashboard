from __future__ import annotations

import os

import sentry_sdk
from celery import Celery
from sentry_sdk.integrations.celery import CeleryIntegration

from services.common.settings import load_settings

settings = load_settings()

if settings.environment == "production" and settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        traces_sample_rate=settings.sentry_celery_traces_sample_rate,
        send_default_pii=False,
        integrations=[CeleryIntegration()],
    )

redis_url = settings.redis_url or "redis://localhost:6380/0"

celery_app = Celery(
    "shopmetrics",
    broker=redis_url,
    backend=redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_default_retry_delay=60,
    task_max_retries=3,
)

# Scheduled refresh configuration (every 6 hours by default)
scheduled_refresh_interval_minutes = int(os.getenv("SCHEDULED_REFRESH_INTERVAL_MINUTES", "360"))

celery_app.conf.beat_schedule = {
    "scheduled-tenant-refresh": {
        "task": "services.ingestion.tasks.scheduled_refresh_all_tenants",
        "schedule": scheduled_refresh_interval_minutes * 60.0,
    },
}

celery_app.autodiscover_tasks(["services.ingestion"])
