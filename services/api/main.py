from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI

from services.api.dependencies import get_repository
from services.api.error_handler import setup_error_handlers
from services.api.middleware import setup_correlation_id, setup_cors, setup_security_headers
from services.api.metrics import setup_metrics
from services.api.rate_limiter import setup_rate_limiting
from services.api.routes import admin, auth, health, projects
from services.common.logging_config import setup_logging
from services.common.postgres_repository import PostgresDashboardRepository
from services.common.settings import load_settings

settings = load_settings()

setup_logging(environment=settings.environment)

if settings.environment == "production" and settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        traces_sample_rate=1.0,
        send_default_pii=False,  # S3: never send PII (emails, IPs) to Sentry
    )

logger = logging.getLogger(__name__)

if not settings.redis_url:
    logger.warning("REDIS_URL not set. JWT revocation and rate limiting will be disabled.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle: startup and shutdown events."""
    # Startup: initialize connection pool
    repository = get_repository()
    if isinstance(repository, PostgresDashboardRepository):
        await repository.initialize_pool()

    yield

    # Shutdown: close connection pool
    if isinstance(repository, PostgresDashboardRepository):
        await repository.close_pool()


app = FastAPI(title=settings.api_title, lifespan=lifespan)

setup_cors(app, allowed_origins=settings.cors_allowed_origins)  # S5
setup_correlation_id(app)
setup_security_headers(app)
setup_rate_limiting(
    app,
    redis_url=settings.redis_url,
    trusted_proxy_count=settings.trusted_proxy_count,  # S2
)
setup_error_handlers(app)
setup_metrics(app)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(admin.router)
