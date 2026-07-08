from __future__ import annotations

import asyncpg
from celery.result import AsyncResult
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from services.api.dependencies import get_current_claims, get_repository, get_settings
from services.api.exceptions import AuthorizationError, ConflictError, NotFoundError
from services.common.models import Role
from services.common.repository import DashboardRepository, to_public_dict
from services.common.settings import Settings
from services.ingestion.celery_app import celery_app
from services.ingestion.tasks import run_tenant_refresh

# S8: Set of allowed Role string values for user create/update validation.
_ALLOWED_ROLES = {r.value for r in Role}

_PUBLIC_SETTINGS = {"site_title", "logo_text", "footer_text", "brand_color"}
_APPEARANCE_SETTINGS = {"brand_color", "default_theme", "date_format"}
_ADMIN_ONLY_SETTINGS = {"site_title", "logo_text", "footer_text", "support_email", "support_url"}
_ALL_SETTINGS = _APPEARANCE_SETTINGS | _ADMIN_ONLY_SETTINGS

router = APIRouter(prefix="/admin", tags=["admin"])


def require_platform_admin(claims=Depends(get_current_claims)):
    """PLATFORM_ADMIN only — for settings, connections, cross-company ops."""
    if claims.role != Role.PLATFORM_ADMIN:
        raise AuthorizationError("Platform admin role required")
    return claims


def require_client_admin_or_above(claims=Depends(get_current_claims)):
    """CLIENT_ADMIN or PLATFORM_ADMIN — for company-scoped admin ops."""
    if claims.role not in (Role.PLATFORM_ADMIN, Role.CLIENT_ADMIN):
        raise AuthorizationError("Admin role required")
    return claims


def require_authenticated(claims=Depends(get_current_claims)):
    """Any authenticated user."""
    return claims


async def _assert_company_access_to_tenant(
    claims, tenant_id: str, repository: DashboardRepository
) -> None:
    if claims.role == Role.PLATFORM_ADMIN:
        return
    if tenant_id not in claims.tenant_ids:
        raise AuthorizationError("Tenant not accessible")


async def _assert_company_access_to_project(
    claims, project_id: str, repository: DashboardRepository
) -> None:
    if claims.role == Role.PLATFORM_ADMIN:
        return
    projects = await repository.list_projects(claims)
    if not any(p.id == project_id for p in projects):
        raise AuthorizationError("Project not accessible")


class TenantCreateRequest(BaseModel):
    name: str
    slug: str
    locale: str = "fr-CA"


class TenantUpdateRequest(BaseModel):
    name: str | None = None
    slug: str | None = None
    locale: str | None = None


class ProviderConnectionRequest(BaseModel):
    base_url: str
    client_id: str
    client_secret: str | None = None
    status: str = "active"
    display_name: str | None = None


class UserCreateRequest(BaseModel):
    email: str
    name: str | None = None
    role: str = "TENANT_USER"
    tenant_id: str | None = None
    project_ids: list[str] = []
    tenant_ids: list[str] = []
    password: str


class UserUpdateRequest(BaseModel):
    name: str | None = None
    role: str | None = None
    tenant_id: str | None = None
    project_ids: list[str] | None = None
    tenant_ids: list[str] | None = None
    status: str | None = None
    password: str | None = None


class ProjectUpdateRequest(BaseModel):
    name: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    client_name: str | None = None


class PhotoSlotLabel(BaseModel):
    kind: str
    label: str


class PhotoSlotUpdateRequest(BaseModel):
    labels: list[PhotoSlotLabel]


class ProjectMetricItem(BaseModel):
    key: str
    label: str
    value: float
    unit: str | None = None
    category: str | None = None


class ProjectMetricUpdateRequest(BaseModel):
    metrics: list[ProjectMetricItem]


class SettingUpdateRequest(BaseModel):
    value: str


class CompanyCreateRequest(BaseModel):
    name: str
    slug: str


class CompanyUpdateRequest(BaseModel):
    name: str | None = None
    slug: str | None = None


def require_admin_operation(repository: DashboardRepository, method_name: str):
    method = getattr(repository, method_name, None)
    if method is None:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Admin operation requires BACKEND_REPOSITORY=postgres",
        )
    return method


async def _validate_user_fields(
    *,
    role: str | None,
    tenant_id: str | None,
    project_ids: list[str] | None,
    repository: DashboardRepository,
) -> None:
    """S8: Validate role, tenant existence, and project—tenant membership.

    Raises HTTP 422 on any invalid input so bad data is rejected before it
    reaches the DB (where it would either be stored as garbage or 500 later).
    """
    if role is not None and role not in _ALLOWED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid role '{role}'. Allowed: {sorted(_ALLOWED_ROLES)}",
        )

    if tenant_id is not None:
        # Verify the tenant exists â€” list_tenants is the only available
        # tenant-lookup surface on the base repository contract.
        list_tenants = getattr(repository, "list_tenants", None)
        if list_tenants is not None:
            tenants = await list_tenants()
            tenant_ids = {t.id for t in tenants}
            if tenant_id not in tenant_ids:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Tenant '{tenant_id}' does not exist",
                )

            if project_ids:
                # Verify every project_id belongs to the given tenant so an
                # admin cannot assign cross-tenant projects to a user.
                from services.common.models import AuthClaims, Role as _Role
                admin_claims = AuthClaims(
                    user_id="__admin_validation__",
                    role=_Role.PLATFORM_ADMIN,
                    tenant_id=None,
                )
                list_projects = getattr(repository, "list_projects", None)
                if list_projects is not None:
                    all_projects = await list_projects(admin_claims)
                    tenant_project_ids = {
                        p.id for p in all_projects if p.tenant_id == tenant_id
                    }
                    bad = [pid for pid in project_ids if pid not in tenant_project_ids]
                    if bad:
                        raise HTTPException(
                            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail=(
                                f"project_ids {bad} do not belong to tenant '{tenant_id}'"
                            ),
                        )


@router.get("/tenants")
async def list_tenants(
    claims=Depends(require_client_admin_or_above),
    repository: DashboardRepository = Depends(get_repository),
) -> list[dict]:
    if claims.role == Role.PLATFORM_ADMIN:
        return [to_public_dict(t) for t in await repository.list_tenants()]
    return [to_public_dict(t) for t in await repository.list_tenants_for_admin(claims.tenant_ids)]


@router.get("/tenants/{tenant_id}/projects")
async def list_tenant_projects(
    tenant_id: str,
    claims=Depends(require_client_admin_or_above),
    repository: DashboardRepository = Depends(get_repository),
) -> list[dict]:
    await _assert_company_access_to_tenant(claims, tenant_id, repository)
    projects = await repository.list_projects(claims)
    tenant_projects = [to_public_dict(p) for p in projects if p.tenant_id == tenant_id]
    return tenant_projects


@router.patch("/tenants/{tenant_id}/projects/{project_id}")
async def update_project(
    tenant_id: str,
    project_id: str,
    request: ProjectUpdateRequest,
    claims=Depends(require_client_admin_or_above),
    repository: DashboardRepository = Depends(get_repository),
) -> dict:
    await _assert_company_access_to_tenant(claims, tenant_id, repository)
    method = require_admin_operation(repository, "update_project")
    try:
        return to_public_dict(
            await method(tenant_id, project_id, request.name, request.start_date, request.end_date, request.client_name)
        )
    except ValueError as exc:
        raise NotFoundError(str(exc)) from exc


@router.post("/tenants")
async def create_tenant(
    request: TenantCreateRequest,
    _claims=Depends(require_platform_admin),
    repository: DashboardRepository = Depends(get_repository),
) -> dict:
    method = require_admin_operation(repository, "create_tenant")
    return to_public_dict(await method(request.name, request.slug, request.locale))


@router.patch("/tenants/{tenant_id}")
async def update_tenant(
    tenant_id: str,
    request: TenantUpdateRequest,
    _claims=Depends(require_platform_admin),
    repository: DashboardRepository = Depends(get_repository),
) -> dict:
    method = require_admin_operation(repository, "update_tenant")
    try:
        return to_public_dict(await method(tenant_id, request.name, request.slug, request.locale))
    except ValueError as exc:
        raise NotFoundError(str(exc)) from exc


@router.get("/tenants/{tenant_id}/shopmetrics-connection")
async def get_shopmetrics_connection(
    tenant_id: str,
    claims=Depends(require_client_admin_or_above),
    repository: DashboardRepository = Depends(get_repository),
) -> dict:
    await _assert_company_access_to_tenant(claims, tenant_id, repository)
    method = require_admin_operation(repository, "get_provider_connection")
    try:
        return await method(tenant_id)
    except ValueError as exc:
        raise NotFoundError(str(exc)) from exc


@router.patch("/tenants/{tenant_id}/shopmetrics-connection")
async def update_shopmetrics_connection(
    tenant_id: str,
    request: ProviderConnectionRequest,
    _claims=Depends(require_platform_admin),
    repository: DashboardRepository = Depends(get_repository),
    settings: Settings = Depends(get_settings),
) -> dict:
    method = require_admin_operation(repository, "update_provider_connection")
    try:
        return await method(
            tenant_id=tenant_id,
            base_url=request.base_url,
            client_id=request.client_id,
            client_secret=request.client_secret,
            status=request.status,
            encryption_key=settings.secret_encryption_key,
            display_name=request.display_name,
        )
    except ValueError as exc:
        raise NotFoundError(str(exc)) from exc


@router.post("/tenants/{tenant_id}/refresh")
async def refresh_tenant(
    tenant_id: str,
    _claims=Depends(require_platform_admin),
    settings: Settings = Depends(get_settings),
) -> dict:
    task = run_tenant_refresh.delay(tenant_id, settings.database_url)
    return {
        "task_id": task.id,
        "tenant_id": tenant_id,
        "status": "queued",
    }


@router.get("/tasks/{task_id}")
async def get_task_status(
    task_id: str,
    _claims=Depends(require_platform_admin),
) -> dict:
    result = AsyncResult(task_id, app=celery_app)
    response = {
        "task_id": task_id,
        "status": result.status,
    }
    if result.ready():
        response["result"] = result.result
    elif result.failed():
        response["error"] = str(result.result)
    return response


@router.get("/tenants/{tenant_id}/scheduled-refresh")
async def get_scheduled_refresh_status(
    tenant_id: str,
    claims=Depends(require_client_admin_or_above),
    settings: Settings = Depends(get_settings),
) -> dict:
    import redis

    enabled = True  # default
    if settings.redis_url:
        try:
            client = redis.from_url(settings.redis_url, decode_responses=True)
            val = client.get(f"scheduled_refresh:{tenant_id}")
            if val is not None:
                enabled = val == "1"
        except Exception:
            pass
    return {"tenant_id": tenant_id, "enabled": enabled}


@router.post("/tenants/{tenant_id}/scheduled-refresh")
async def set_scheduled_refresh_status(
    tenant_id: str,
    request: dict,
    _claims=Depends(require_platform_admin),
    settings: Settings = Depends(get_settings),
) -> dict:
    import redis

    enabled = request.get("enabled", True)
    if settings.redis_url:
        try:
            client = redis.from_url(settings.redis_url, decode_responses=True)
            client.set(f"scheduled_refresh:{tenant_id}", "1" if enabled else "0")
        except Exception:
            pass
    return {"tenant_id": tenant_id, "enabled": enabled}


@router.get("/runs")
async def list_runs(
    claims=Depends(require_client_admin_or_above),
    repository: DashboardRepository = Depends(get_repository),
) -> list[dict]:
    if claims.role == Role.PLATFORM_ADMIN:
        return [to_public_dict(run) for run in await repository.list_run_logs()]
    return [to_public_dict(run) for run in await repository.list_run_logs_for_tenants(claims.tenant_ids)]


@router.get("/users")
async def list_users(
    claims=Depends(require_client_admin_or_above),
    repository: DashboardRepository = Depends(get_repository),
) -> list[dict]:
    if claims.role == Role.PLATFORM_ADMIN:
        return [to_public_dict(user) for user in await repository.list_users()]
    return [to_public_dict(user) for user in await repository.list_users_for_tenants(claims.tenant_ids)]


@router.post("/users")
async def create_user(
    request: UserCreateRequest,
    claims=Depends(require_client_admin_or_above),
    repository: DashboardRepository = Depends(get_repository),
) -> dict:
    if claims.role == Role.CLIENT_ADMIN and request.role == "PLATFORM_ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot create PLATFORM_ADMIN users",
        )
    await _validate_user_fields(
        role=request.role,
        tenant_id=request.tenant_id,
        project_ids=request.project_ids,
        repository=repository,
    )
    if claims.role == Role.CLIENT_ADMIN:
        if request.tenant_id and request.tenant_id not in claims.tenant_ids:
            raise AuthorizationError("Tenant not accessible")
        for tid in request.tenant_ids:
            if tid not in claims.tenant_ids:
                raise AuthorizationError("Tenant not accessible")
    method = require_admin_operation(repository, "create_user_metadata")
    if claims.role == Role.CLIENT_ADMIN:
        company_id = claims.company_id
    elif request.tenant_id:
        tenant = next(
            (t for t in await repository.list_tenants() if t.id == request.tenant_id), None
        )
        company_id = tenant.company_id if tenant else None
    else:
        company_id = None
    try:
        return await method(
            email=request.email,
            name=request.name,
            role=request.role,
            tenant_id=request.tenant_id,
            project_ids=request.project_ids,
            password=request.password,
            company_id=company_id,
            tenant_ids=request.tenant_ids,
        )
    except asyncpg.exceptions.UniqueViolationError as exc:
        raise ConflictError("A user with this email already exists") from exc


@router.patch("/users/{user_id}")
async def update_user(
    user_id: str,
    request: UserUpdateRequest,
    claims=Depends(require_client_admin_or_above),
    repository: DashboardRepository = Depends(get_repository),
) -> dict:
    if claims.role == Role.CLIENT_ADMIN and request.role == "PLATFORM_ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot assign PLATFORM_ADMIN role",
        )
    if claims.role == Role.CLIENT_ADMIN:
        tenant_users = await repository.list_users_for_tenants(claims.tenant_ids)
        if not any(u.id == user_id for u in tenant_users):
            raise AuthorizationError("User not accessible")
    await _validate_user_fields(
        role=request.role,
        tenant_id=request.tenant_id,
        project_ids=request.project_ids,
        repository=repository,
    )
    if claims.role == Role.CLIENT_ADMIN:
        if request.tenant_id and request.tenant_id not in claims.tenant_ids:
            raise AuthorizationError("Tenant not accessible")
        if request.tenant_ids:
            for tid in request.tenant_ids:
                if tid not in claims.tenant_ids:
                    raise AuthorizationError("Tenant not accessible")
    method = require_admin_operation(repository, "update_user_metadata")
    try:
        return await method(
            user_id,
            name=request.name,
            role=request.role,
            tenant_id=request.tenant_id,
            project_ids=request.project_ids,
            status=request.status,
            password=request.password,
            tenant_ids=request.tenant_ids,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/users/{user_id}/password-reset")
async def issue_password_reset(
    user_id: str,
    claims=Depends(require_client_admin_or_above),
    repository: DashboardRepository = Depends(get_repository),
) -> dict:
    """Admin-only: issue a one-time password-reset token for a user.

    The raw token is returned exclusively to the authenticated admin â€” this is
    intentional and authorised.  The admin acts as the secure out-of-band
    delivery channel (e.g. they relay the code to the user via a trusted
    channel).  This is NOT a secret leak to an unauthenticated party.

    tenant_id is derived server-side from user metadata; it is never accepted
    from the request body or query string (tenant isolation rule).
    Raw token is never logged.
    """
    from datetime import datetime, timezone, timedelta

    if claims.role == Role.CLIENT_ADMIN:
        tenant_users = await repository.list_users_for_tenants(claims.tenant_ids)
        if not any(u.id == user_id for u in tenant_users):
            raise AuthorizationError("User not accessible")

    get_meta = require_admin_operation(repository, "get_user_metadata")
    try:
        meta = await get_meta(user_id)
    except ValueError as exc:
        raise NotFoundError(str(exc)) from exc

    # Derive tenant_id from verified server-side metadata â€” never from caller.
    tenant_id: str | None = meta.get("tenant_id")

    issue = require_admin_operation(repository, "issue_password_reset_token")
    ttl_seconds = 3600
    raw_token = await issue(
        user_id=user_id,
        tenant_id=tenant_id,
        ttl_seconds=ttl_seconds,
    )
    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)).isoformat()

    # raw_token intentionally included â€” admin is the authorised delivery channel.
    # Do not log the token value.
    return {
        "token": raw_token,
        "expires_at": expires_at,
        "user_id": user_id,
    }


@router.get("/projects/{project_id}/photo-slots")
async def get_photo_slots(
    project_id: str,
    claims=Depends(require_client_admin_or_above),
    repository: DashboardRepository = Depends(get_repository),
) -> list[dict]:
    await _assert_company_access_to_project(claims, project_id, repository)
    method = require_admin_operation(repository, "list_photo_slot_labels")
    try:
        return await method(project_id)
    except ValueError as exc:
        raise NotFoundError(str(exc)) from exc


@router.patch("/projects/{project_id}/photo-slots")
async def update_photo_slots(
    project_id: str,
    request: PhotoSlotUpdateRequest,
    claims=Depends(require_client_admin_or_above),
    repository: DashboardRepository = Depends(get_repository),
) -> list[dict]:
    await _assert_company_access_to_project(claims, project_id, repository)
    method = require_admin_operation(repository, "update_photo_slot_labels")
    try:
        return await method(project_id, [item.model_dump() for item in request.labels])
    except ValueError as exc:
        raise NotFoundError(str(exc)) from exc


@router.get("/projects/{project_id}/metrics")
async def get_project_metrics(
    project_id: str,
    claims=Depends(require_client_admin_or_above),
    repository: DashboardRepository = Depends(get_repository),
) -> list[dict]:
    await _assert_company_access_to_project(claims, project_id, repository)
    method = require_admin_operation(repository, "list_project_metrics")
    try:
        return await method(project_id)
    except ValueError as exc:
        raise NotFoundError(str(exc)) from exc


@router.patch("/projects/{project_id}/metrics")
async def update_project_metrics(
    project_id: str,
    request: ProjectMetricUpdateRequest,
    claims=Depends(require_client_admin_or_above),
    repository: DashboardRepository = Depends(get_repository),
) -> list[dict]:
    await _assert_company_access_to_project(claims, project_id, repository)
    method = require_admin_operation(repository, "update_project_metrics")
    try:
        return await method(project_id, [item.model_dump() for item in request.metrics])
    except ValueError as exc:
        raise NotFoundError(str(exc)) from exc


@router.get("/settings")
async def list_settings(
    claims=Depends(require_authenticated),
    repository: DashboardRepository = Depends(get_repository),
) -> dict:
    method = require_admin_operation(repository, "get_platform_settings")
    all_values = await method(list(_ALL_SETTINGS))
    if claims.role not in (Role.PLATFORM_ADMIN, Role.CLIENT_ADMIN):
        return {k: v for k, v in all_values.items() if k in _APPEARANCE_SETTINGS}
    return all_values


@router.get("/settings/{key}")
async def get_setting(
    key: str,
    claims=Depends(require_authenticated),
    repository: DashboardRepository = Depends(get_repository),
) -> dict:
    if key not in _ALL_SETTINGS:
        raise NotFoundError(f"Setting '{key}' not found")
    if key in _ADMIN_ONLY_SETTINGS and claims.role not in (Role.PLATFORM_ADMIN, Role.CLIENT_ADMIN):
        raise AuthorizationError("Admin role required")
    method = require_admin_operation(repository, "get_platform_setting")
    value = await method(key)
    if value is None:
        raise NotFoundError(f"Setting '{key}' not found")
    return {"key": key, "value": value}


@router.patch("/settings/{key}")
async def update_setting(
    key: str,
    request: SettingUpdateRequest,
    claims=Depends(require_authenticated),
    repository: DashboardRepository = Depends(get_repository),
) -> dict:
    if key not in _ALL_SETTINGS:
        raise NotFoundError(f"Setting '{key}' not found")
    if key in _ADMIN_ONLY_SETTINGS and claims.role not in (Role.PLATFORM_ADMIN, Role.CLIENT_ADMIN):
        raise AuthorizationError("Admin role required")
    method = require_admin_operation(repository, "set_platform_setting")
    value = await method(key, request.value)
    return {"key": key, "value": value}


# ── Company management (PLATFORM_ADMIN only) ────────────────────────────

@router.get("/companies")
async def list_companies(
    claims=Depends(require_client_admin_or_above),
    repository: DashboardRepository = Depends(get_repository),
) -> list[dict]:
    all_companies = await repository.list_companies()
    if claims.role == Role.CLIENT_ADMIN:
        admin_tenants = await repository.list_tenants_for_admin(claims.tenant_ids)
        allowed_company_ids = {t.company_id for t in admin_tenants if t.company_id}
        all_companies = [c for c in all_companies if c.id in allowed_company_ids]
    result = []
    for company in all_companies:
        d = to_public_dict(company)
        tenants = await repository.list_tenants_for_company(company.id)
        d["tenant_count"] = len(tenants)
        result.append(d)
    return result


@router.post("/companies")
async def create_company(
    request: CompanyCreateRequest,
    _claims=Depends(require_platform_admin),
    repository: DashboardRepository = Depends(get_repository),
) -> dict:
    name = request.name.strip()
    slug = request.slug.strip().lower()
    if not name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Company name is required")
    if not slug:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Company slug is required")
    import re
    if not re.match(r"^[a-z0-9-]+$", slug):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Slug must be lowercase alphanumeric with hyphens only")
    company_id = f"company_{slug}"
    try:
        company = await repository.create_company(company_id, name, slug)
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Company slug already exists")
        raise
    return to_public_dict(company)


@router.patch("/companies/{company_id}")
async def update_company(
    company_id: str,
    request: CompanyUpdateRequest,
    _claims=Depends(require_platform_admin),
    repository: DashboardRepository = Depends(get_repository),
) -> dict:
    method = require_admin_operation(repository, "update_company")
    try:
        company = await method(company_id, request.name, request.slug)
    except ValueError as exc:
        raise NotFoundError(str(exc)) from exc
    return to_public_dict(company)


@router.get("/companies/{company_id}/tenants")
async def list_company_tenants(
    company_id: str,
    _claims=Depends(require_platform_admin),
    repository: DashboardRepository = Depends(get_repository),
) -> list[dict]:
    tenants = await repository.list_tenants_for_company(company_id)
    return [to_public_dict(t) for t in tenants]
