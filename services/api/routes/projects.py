from __future__ import annotations

from fastapi import APIRouter, Depends

from services.api.dependencies import get_current_claims, get_repository, get_settings
from services.api.exceptions import NotFoundError
from services.common.cache import CacheAside
from services.common.repository import DashboardRepository, to_client_visit_dict, to_public_dict
from services.common.settings import Settings
from services.common.tenancy import AuthorizationError, assert_project_access

router = APIRouter(tags=["projects"])

_cache = CacheAside()


async def _init_cache(settings: Settings = Depends(get_settings)) -> CacheAside:
    if not _cache._redis:
        _cache._redis_url = settings.redis_url
    return _cache


def _not_found(exc: AuthorizationError | None = None) -> NotFoundError:
    return NotFoundError("Project not found")


@router.get("/projects")
async def list_projects(
    claims=Depends(get_current_claims),
    repository: DashboardRepository = Depends(get_repository),
) -> list[dict]:
    return [to_public_dict(project) for project in await repository.list_projects(claims)]


@router.get("/projects/{project_id}/summary")
async def project_summary(
    project_id: str,
    claims=Depends(get_current_claims),
    repository: DashboardRepository = Depends(get_repository),
    cache: CacheAside = Depends(_init_cache),
) -> dict:
    # Authorize before touching the cache so a cache hit can never serve a project the
    # caller is not allowed to see. Key by the project's own tenant (not the caller's, which
    # is None for CLIENT_ADMIN) so tenant-scoped invalidation still matches.
    try:
        project = assert_project_access(claims, await repository.get_project(project_id))
    except AuthorizationError as exc:
        raise _not_found(exc) from exc
    cache_key = f"summary:{project.tenant_id}:{project_id}"
    cached = await cache.get(cache_key, endpoint="project_summary")
    if cached is not None:
        return cached
    result = to_public_dict(await repository.get_project_summary(claims, project_id))
    await cache.set(cache_key, result, ttl=300)
    return result


@router.get("/projects/{project_id}/visits")
async def list_visits(
    project_id: str,
    claims=Depends(get_current_claims),
    repository: DashboardRepository = Depends(get_repository),
    cache: CacheAside = Depends(_init_cache),
) -> list[dict]:
    # Authorize before the cache read; key by the project's tenant (see project_summary).
    try:
        project = assert_project_access(claims, await repository.get_project(project_id))
    except AuthorizationError as exc:
        raise _not_found(exc) from exc
    cache_key = f"visits:{project.tenant_id}:{project_id}"
    cached = await cache.get(cache_key, endpoint="project_visits")
    if cached is not None:
        return cached
    result = await repository.list_visits(claims, project_id)
    await cache.set(cache_key, result, ttl=120)
    return result


@router.get("/projects/{project_id}/visits/{instance_id}")
async def visit_detail(
    project_id: str,
    instance_id: str,
    claims=Depends(get_current_claims),
    repository: DashboardRepository = Depends(get_repository),
) -> dict:
    try:
        visit = await repository.get_visit(claims, project_id, instance_id)
    except AuthorizationError as exc:
        raise _not_found(exc) from exc
    if visit is None:
        raise _not_found()
    # S4: strip tenant_id / project_id from client-facing visit detail
    return to_client_visit_dict(visit)


@router.get("/projects/{project_id}/visits/{instance_id}/photos")
async def visit_photos(
    project_id: str,
    instance_id: str,
    claims=Depends(get_current_claims),
    repository: DashboardRepository = Depends(get_repository),
) -> list[dict]:
    try:
        return [
            # S4: strip tenant_id / project_id from client-facing photo responses
            to_client_visit_dict(photo)
            for photo in await repository.list_photos(claims, project_id, instance_id)
        ]
    except AuthorizationError as exc:
        raise _not_found(exc) from exc
