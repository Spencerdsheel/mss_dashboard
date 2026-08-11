from __future__ import annotations

import base64
import hashlib
import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query

from services.api.dependencies import get_current_claims, get_repository, get_settings
from services.api.exceptions import NotFoundError
from services.common.cache import CacheAside
from services.common.repository import DashboardRepository, VisitFilters, to_client_visit_dict, to_public_dict
from services.common.settings import Settings
from services.common.tenancy import AuthorizationError, assert_project_access, tenant_scope

router = APIRouter(tags=["projects"])

_cache = CacheAside()

_ALLOWED_SORT = {"visit_date"}
_ALLOWED_DIR = {"asc", "desc"}
_MAX_SEARCH_LEN = 100


async def _init_cache(settings: Settings = Depends(get_settings)) -> CacheAside:
    if not _cache._redis:
        _cache._redis_url = settings.redis_url
    return _cache


def _not_found(exc: AuthorizationError | None = None) -> NotFoundError:
    return NotFoundError("Project not found")


# ── Cursor codec (route-layer concern; the cursor is opaque and non-secret) ──


def _encode_cursor(visit_date: str, survey_id: str, o: str) -> str:
    return base64.urlsafe_b64encode(
        json.dumps({"d": visit_date, "s": survey_id, "o": o}, separators=(",", ":")).encode()
    ).decode()


def _decode_cursor(raw: str) -> dict:
    try:
        data = json.loads(base64.urlsafe_b64decode(raw.encode()))
        if data.get("o") not in ("next", "prev"):
            raise ValueError("invalid cursor direction")
        date.fromisoformat(data["d"])
        str(data["s"])
        return data
    except Exception as exc:
        raise HTTPException(422, "Invalid cursor") from exc


def _decode_filters(raw: str | None) -> VisitFilters | None:
    if raw is None or not raw.strip():
        return None
    try:
        data = json.loads(raw)
    except Exception as exc:
        raise HTTPException(422, "Invalid filters JSON") from exc
    if not isinstance(data, dict):
        raise HTTPException(422, "filters must be a JSON object")
    try:
        return VisitFilters.model_validate(data)
    except Exception as exc:
        raise HTTPException(422, f"Invalid filters: {exc}") from exc


def _page_cache_key(
    tenant_id: str,
    project_id: str,
    *,
    cursor: str | None,
    limit: int,
    dir: str,
    search: str | None,
    filters: str | None,
) -> str:
    raw = f"{cursor}|{limit}|{dir}|{search}|{filters}"
    digest = hashlib.sha256(raw.encode()).hexdigest()[:16]
    return f"t:{tenant_id}:p:{project_id}:visits:{digest}"


@router.get("/projects")
async def list_projects(
    claims=Depends(get_current_claims),
    repository: DashboardRepository = Depends(get_repository),
) -> list[dict]:
    return [to_public_dict(project) for project in await repository.list_projects(claims)]


@router.get("/projects/{project_id}")
async def get_single_project(
    project_id: str,
    claims=Depends(get_current_claims),
    repository: DashboardRepository = Depends(get_repository),
) -> dict:
    """Single project with server-side access check."""
    try:
        project = assert_project_access(
            claims, await repository.get_project(project_id, tenant_scope(claims))
        )
    except AuthorizationError as exc:
        raise _not_found(exc) from exc
    return to_public_dict(project)


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
        project = assert_project_access(
            claims, await repository.get_project(project_id, tenant_scope(claims))
        )
    except AuthorizationError as exc:
        raise _not_found(exc) from exc

    cache_key = f"t:{project.tenant_id}:p:{project_id}:summary"

    async def _refresh() -> dict:
        return to_public_dict(await repository.get_project_summary(claims, project_id))

    return await cache.get_swr(
        cache_key,
        endpoint="project_summary",
        refresh=_refresh,
        soft_ttl=300,
        hard_ttl=900,
        tenant_id=project.tenant_id,
    )


@router.get("/projects/{project_id}/dashboard-layout/{page}")
@router.get("/projects/{project_id}/dashboard-layout")
async def get_dashboard_layout(
    project_id: str,
    page: str = "overview",
    claims=Depends(get_current_claims),
    repository: DashboardRepository = Depends(get_repository),
) -> dict:
    """Sprint 13a — read the project's stored widget-dashboard layout.

    Available to all authenticated project-accessors (every role must be able
    to render the dashboard) — only *writing* (13b) is admin-gated, in
    admin.py. Thin handler: authorize, call the repository, shape the
    response. `layout: null` means "no stored layout"; the frontend renders
    DEFAULT_LAYOUT.
    """
    from services.common.layout_schema import ALLOWED_LAYOUT_PAGES
    if page not in ALLOWED_LAYOUT_PAGES:
        raise HTTPException(status_code=422, detail=f"Unknown dashboard page: {page!r}")
    try:
        project = assert_project_access(
            claims, await repository.get_project(project_id, tenant_scope(claims))
        )
    except AuthorizationError as exc:
        raise _not_found(exc) from exc

    layout = await repository.get_dashboard_layout(claims, project.id, page)
    if layout is None:
        return {"layout": None, "source": None, "updated_at": None}
    return {
        "layout": layout.layout,
        "source": layout.source,
        "updated_at": layout.updated_at.isoformat() if layout.updated_at else None,
    }


@router.get("/projects/{project_id}/visits")
async def list_visits(
    project_id: str,
    claims=Depends(get_current_claims),
    repository: DashboardRepository = Depends(get_repository),
    cache: CacheAside = Depends(_init_cache),
    cursor: str | None = Query(default=None),
    limit: int | None = Query(default=None, ge=1, le=100),
    sort: str = Query(default="visit_date"),
    dir: str = Query(default="desc"),
    search: str | None = Query(default=None),
    filters: str | None = Query(default=None),
) -> dict | list[dict]:
    # Authorize before the cache read; key by the project's tenant (see project_summary).
    try:
        project = assert_project_access(
            claims, await repository.get_project(project_id, tenant_scope(claims))
        )
    except AuthorizationError as exc:
        raise _not_found(exc) from exc

    # Transition (spec §3.4): when NO pagination params at all are supplied,
    # keep the legacy bare-list behavior for one sprint (frontend still does
    # client-side paging). The repository itself now hard-caps this at 5000
    # rows — see PostgresDashboardRepository.list_visits.
    no_pagination_params = (
        cursor is None and limit is None and sort == "visit_date" and dir == "desc"
        and search is None and filters is None
    )
    if no_pagination_params:
        cache_key = f"t:{project.tenant_id}:p:{project_id}:visits:legacy"
        cached = await cache.get(cache_key, endpoint="project_visits")
        if cached is not None:
            return cached
        result = await repository.list_visits(claims, project_id)
        await cache.set(cache_key, result, ttl=120, tenant_id=project.tenant_id)
        return result

    if sort not in _ALLOWED_SORT:
        raise HTTPException(422, f"Unsupported sort '{sort}'. Allowed: {sorted(_ALLOWED_SORT)}")
    if dir not in _ALLOWED_DIR:
        raise HTTPException(422, f"Unsupported dir '{dir}'. Allowed: {sorted(_ALLOWED_DIR)}")

    effective_limit = limit if limit is not None else 25

    trimmed_search: str | None = None
    if search is not None:
        trimmed_search = search.strip()
        if len(trimmed_search) > _MAX_SEARCH_LEN:
            raise HTTPException(422, f"search must be at most {_MAX_SEARCH_LEN} characters")
        if not trimmed_search:
            trimmed_search = None

    parsed_filters = _decode_filters(filters)
    decoded_cursor = _decode_cursor(cursor) if cursor is not None else None

    cache_key = _page_cache_key(
        project.tenant_id,
        project_id,
        cursor=cursor,
        limit=effective_limit,
        dir=dir,
        search=trimmed_search,
        filters=filters,
    )

    async def _refresh() -> dict:
        items, total_count, filter_options = await repository.list_visits_page(
            claims,
            project_id,
            cursor=decoded_cursor,
            limit=effective_limit,
            direction=dir,
            search=trimmed_search,
            filters=parsed_filters,
        )

        next_cursor: str | None = None
        prev_cursor: str | None = None
        if items:
            last = items[-1]
            first = items[0]
            # `_keyset_has_more` reflects whether the peeked (limit+1)-th row
            # existed *in scan order* — its meaning as "next" vs "prev" flips
            # depending on which direction we scanned to build this page.
            has_more_in_scan_dir = bool(last.get("_keyset_has_more"))

            if decoded_cursor is None:
                # First page: no earlier data by definition.
                prev_cursor = None
                next_cursor = (
                    _encode_cursor(last["_keyset_visit_date"], last["_keyset_survey_id"], "next")
                    if has_more_in_scan_dir
                    else None
                )
            elif decoded_cursor["o"] == "next":
                # Scanned forward from a known row: an earlier page necessarily
                # exists (we arrived here via that row's "next" click).
                prev_cursor = _encode_cursor(
                    first["_keyset_visit_date"], first["_keyset_survey_id"], "prev"
                )
                next_cursor = (
                    _encode_cursor(last["_keyset_visit_date"], last["_keyset_survey_id"], "next")
                    if has_more_in_scan_dir
                    else None
                )
            else:  # decoded_cursor["o"] == "prev"
                # Scanned backward: a later page necessarily exists (we arrived
                # here via that page's "prev" click); has_more_in_scan_dir tells
                # us whether there's yet another page further back.
                next_cursor = _encode_cursor(
                    last["_keyset_visit_date"], last["_keyset_survey_id"], "next"
                )
                prev_cursor = (
                    _encode_cursor(first["_keyset_visit_date"], first["_keyset_survey_id"], "prev")
                    if has_more_in_scan_dir
                    else None
                )

        # Strip internal keyset-derivation fields before returning to the client.
        clean_items = []
        for item in items:
            item = dict(item)
            item.pop("_keyset_visit_date", None)
            item.pop("_keyset_survey_id", None)
            item.pop("_keyset_has_more", None)
            clean_items.append(item)

        return {
            "items": clean_items,
            "next_cursor": next_cursor,
            "prev_cursor": prev_cursor,
            "total_count": total_count,
            "filter_options": filter_options,
        }

    return await cache.get_swr(
        cache_key,
        endpoint="project_visits_page",
        refresh=_refresh,
        soft_ttl=120,
        hard_ttl=600,
        tenant_id=project.tenant_id,
    )


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
