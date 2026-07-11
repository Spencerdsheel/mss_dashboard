from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _load_dotenv():
    """Load .env file from project root if it exists."""
    try:
        from dotenv import load_dotenv
        env_path = Path(__file__).parent.parent.parent / ".env"
        if env_path.exists():
            load_dotenv(env_path)
    except ImportError:
        pass  # python-dotenv not installed, skip


_load_dotenv()


@dataclass(frozen=True)
class Settings:
    environment: str = "development"
    jwt_secret: str = "dev-only-change-me"
    jwt_issuer: str = "mss-dashboard-api"
    jwt_ttl_seconds: int = 3600
    jwt_audience: str | None = None
    api_title: str = "Shopmetrics Dashboard API"
    repository_backend: str = "memory"
    database_url: str = "postgresql://postgres:admin@localhost:5433/shopmetrics_demo"
    read_replica_url: str | None = None
    redis_url: str | None = None
    sentry_dsn: str | None = None
    # PgBouncer sits in front of Postgres in transaction-pooling mode, so each
    # uvicorn worker only needs a small local pool; PgBouncer multiplexes onto
    # the shared server-side connections (see docker-compose.yml pgbouncer
    # service). min=2/max=10 per worker keeps total client connections well
    # under PgBouncer's MAX_CLIENT_CONN even with several workers + Celery.
    db_pool_min_size: int = 2
    db_pool_max_size: int = 10
    db_pool_timeout: float = 30.0
    # When true, the asyncpg pool is created with statement_cache_size=0
    # (required for correctness under PgBouncer transaction pooling).
    db_via_pgbouncer: bool = False
    sentry_traces_sample_rate: float = 0.1
    sentry_celery_traces_sample_rate: float = 0.05
    # S1: Dedicated AES-256-GCM key for secret encryption (provider connection
    # secrets stored in the DB). Must differ from jwt_secret so compromise of
    # one does NOT compromise the other.
    #
    # MIGRATION NOTE: If you are rolling this key in after secrets were already
    # stored, you must re-encrypt all rows in dashboard.provider_connections
    # (client_secret_encrypted) with the new key before deploying. The helper
    # `services/common/secrets.py` decrypt_secret / encrypt_secret takes the
    # key as an explicit argument — decrypt with the old jwt_secret value, then
    # re-encrypt with the new SECRET_ENCRYPTION_KEY and update the DB rows.
    secret_encryption_key: str = "dev-only-secret-encryption-key"
    # S2: CORS allowed origins (comma-separated). Dev default = localhost ports.
    # Production MUST set CORS_ALLOWED_ORIGINS to the real frontend origin(s).
    cors_allowed_origins: str = "http://localhost:3000,http://localhost:3001"
    # S2: Number of trusted reverse-proxy hops in front of this server.
    # When > 0, the rate limiter keys on X-Forwarded-For[-(trusted_proxy_count)]
    # instead of request.client.host. Leave at 0 (default) when the service is
    # exposed directly or behind an untrusted proxy.
    trusted_proxy_count: int = 0


def load_settings() -> Settings:
    """Load backend settings from environment variables.

    Defaults are intentionally development-only so Phase 01 can run locally
    without secrets. Production must override JWT_SECRET and SECRET_ENCRYPTION_KEY.
    """

    settings = Settings(
        environment=os.getenv("APP_ENV", "development"),
        jwt_secret=os.getenv("JWT_SECRET", "dev-only-change-me"),
        jwt_issuer=os.getenv("JWT_ISSUER", "mss-dashboard-api"),
        jwt_ttl_seconds=int(os.getenv("JWT_TTL_SECONDS", "3600")),
        jwt_audience=os.getenv("JWT_AUDIENCE"),
        api_title=os.getenv("API_TITLE", "Shopmetrics Dashboard API"),
        repository_backend=os.getenv("BACKEND_REPOSITORY", "memory"),
        database_url=os.getenv(
            "DATABASE_URL",
            "postgresql://postgres:admin@localhost:5433/shopmetrics_demo",
        ),
        read_replica_url=os.getenv("READ_REPLICA_URL"),
        redis_url=os.getenv("REDIS_URL"),
        sentry_dsn=os.getenv("SENTRY_DSN"),
        db_pool_min_size=int(os.getenv("DB_POOL_MIN_SIZE", "2")),
        db_pool_max_size=int(os.getenv("DB_POOL_MAX_SIZE", "10")),
        db_pool_timeout=float(os.getenv("DB_POOL_TIMEOUT", "30")),
        db_via_pgbouncer=os.getenv("DB_VIA_PGBOUNCER", "0").lower() in ("1", "true"),
        sentry_traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
        sentry_celery_traces_sample_rate=float(
            os.getenv("SENTRY_CELERY_TRACES_SAMPLE_RATE", "0.05")
        ),
        secret_encryption_key=os.getenv(
            "SECRET_ENCRYPTION_KEY", "dev-only-secret-encryption-key"
        ),
        cors_allowed_origins=os.getenv(
            "CORS_ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001"
        ),
        trusted_proxy_count=int(os.getenv("TRUSTED_PROXY_COUNT", "0")),
    )
    if settings.environment.lower() == "production":
        if len(settings.jwt_secret) < 32 or settings.jwt_secret.startswith("dev-only"):
            raise ValueError(
                "Production JWT_SECRET must be a strong value of at least 32 characters"
            )
        if settings.repository_backend.lower() != "postgres":
            raise ValueError("Production BACKEND_REPOSITORY must be set to 'postgres'")
        if (
            len(settings.secret_encryption_key) < 32
            or settings.secret_encryption_key.startswith("dev-only")
        ):
            raise ValueError(
                "Production SECRET_ENCRYPTION_KEY must be a strong value of at least "
                "32 characters and must differ from JWT_SECRET"
            )
        if settings.secret_encryption_key == settings.jwt_secret:
            raise ValueError(
                "Production SECRET_ENCRYPTION_KEY must differ from JWT_SECRET"
            )
    return settings
