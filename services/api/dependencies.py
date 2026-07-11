from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from fastapi import Header

from services.api.exceptions import AuthenticationError
from services.common.postgres_repository import PostgresDashboardRepository
from services.common.repository import DashboardRepository, seed_phase01_repository
from services.common.security import AuthError, decode_access_token
from services.common.settings import Settings, load_settings

_memory_repository = seed_phase01_repository()


@lru_cache
def get_settings() -> Settings:
    return load_settings()


@lru_cache
def get_repository() -> DashboardRepository:
    settings = get_settings()
    if settings.repository_backend.lower() == "postgres":
        return PostgresDashboardRepository(
            settings.database_url,
            auth_repository=_memory_repository,
            min_size=settings.db_pool_min_size,
            max_size=settings.db_pool_max_size,
            timeout=settings.db_pool_timeout,
            read_replica_url=settings.read_replica_url,
            via_pgbouncer=settings.db_via_pgbouncer,
        )
    return _memory_repository


def get_current_claims(
    authorization: Annotated[str | None, Header()] = None,
):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise AuthenticationError("Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        settings = get_settings()
        return decode_access_token(token, settings, redis_url=settings.redis_url, jwt_secret=settings.jwt_secret)
    except AuthError as exc:
        raise AuthenticationError(str(exc)) from exc
