from __future__ import annotations

from dataclasses import asdict
from datetime import datetime
from enum import Enum
from typing import Protocol

from .models import (
    AuthClaims,
    Company,
    DistributionEntry,
    Project,
    ProjectMetric,
    ProjectSummary,
    Role,
    RunLog,
    Tenant,
    User,
    Visit,
    VisitPhoto,
)
from .security import hash_password, verify_password
from .tenancy import assert_project_access


class DashboardRepository(Protocol):
    async def authenticate_user(self, email: str, password: str) -> User | None: ...

    async def list_projects(self, claims: AuthClaims) -> list[Project]: ...

    async def get_project(self, project_id: str) -> Project | None: ...

    async def get_project_summary(self, claims: AuthClaims, project_id: str) -> ProjectSummary: ...

    async def list_visits(self, claims: AuthClaims, project_id: str) -> list[dict]: ...

    async def get_visit(self, claims: AuthClaims, project_id: str, instance_id: str) -> Visit | None: ...

    async def list_photos(self, claims: AuthClaims, project_id: str, instance_id: str) -> list[VisitPhoto]: ...

    async def list_tenants(self) -> list[Tenant]: ...

    async def list_users(self) -> list[User]: ...

    async def update_project(
        self,
        tenant_id: str,
        project_id: str,
        name: str | None,
        start_date: str | None,
        end_date: str | None,
        client_name: str | None = None,
    ) -> "Project": ...

    async def list_run_logs(self) -> list[RunLog]: ...

    async def issue_password_reset_token(
        self,
        *,
        user_id: str,
        tenant_id: str | None,
        ttl_seconds: int = 3600,
    ) -> str: ...

    async def consume_password_reset_token(
        self,
        *,
        user_id: str,
        raw_token: str,
        new_password: str,
        tenant_id: str | None = None,
    ) -> bool: ...

    async def get_active_user_for_reset(self, email: str) -> dict | None: ...

    async def list_project_metrics(self, project_id: str) -> list[dict]: ...

    async def update_project_metrics(self, project_id: str, metrics: list[dict]) -> list[dict]: ...

    async def get_platform_setting(self, key: str) -> str | None: ...

    async def set_platform_setting(self, key: str, value: str) -> str: ...

    async def list_companies(self) -> list[Company]: ...

    async def create_company(self, company_id: str, name: str, slug: str) -> Company: ...

    async def get_company(self, company_id: str) -> Company | None: ...

    async def update_company(self, company_id: str, name: str | None = None, slug: str | None = None) -> Company: ...

    async def list_tenants_for_company(self, company_id: str) -> list[Tenant]: ...

    async def list_users_for_company(self, company_id: str) -> list[User]: ...

    async def assign_tenant_to_company(self, tenant_id: str, company_id: str) -> Tenant: ...

    async def list_tenants_for_admin(self, tenant_ids: tuple[str, ...]) -> list[Tenant]: ...

    async def list_users_for_tenants(self, tenant_ids: tuple[str, ...]) -> list[User]: ...


class InMemoryDashboardRepository:
    """Small Phase 01 repository for auth/RBAC/API wiring tests.

    This is not the production persistence layer. SQLAlchemy/Alembic replaces it
    in later phases while keeping the same tenant-scoped method shape.
    """

    def __init__(
        self,
        *,
        tenants: list[Tenant],
        users: list[User],
        projects: list[Project],
        metrics: dict[str, list[ProjectMetric]] | None = None,
        visits: list[Visit] | None = None,
        photos: list[VisitPhoto] | None = None,
        run_logs: list[RunLog] | None = None,
        companies: list[Company] | None = None,
    ) -> None:
        self.tenants = tenants
        self.users = users
        self.projects = projects
        self.companies: list[Company] = companies or []
        self.metrics = metrics or {}
        self.visits = visits or []
        self.photos = photos or []
        self.run_logs = run_logs or []
        # Mutable metric-target store: (tenant_id, project_id, key) -> dict
        self._metric_store: dict[tuple[str, str, str], dict] = {}

    async def authenticate_user(self, email: str, password: str) -> User | None:
        user = next((u for u in self.users if u.email.lower() == email.lower()), None)
        if user and verify_password(password, user.hashed_password):
            return user
        return None

    async def list_projects(self, claims: AuthClaims) -> list[Project]:
        from dataclasses import replace as dc_replace
        from collections import Counter
        visit_counts: Counter[str] = Counter(v.project_id for v in self.visits)

        def _with_count(p: Project) -> Project:
            return dc_replace(p, visit_count=visit_counts.get(p.id, 0))

        if claims.role == Role.PLATFORM_ADMIN:
            return [_with_count(p) for p in sorted(self.projects, key=lambda p: p.name)]
        if claims.role == Role.CLIENT_ADMIN:
            if not claims.tenant_ids:
                return []
            tid_set = set(claims.tenant_ids)
            return [
                _with_count(p)
                for p in sorted(
                    [p for p in self.projects if p.tenant_id in tid_set],
                    key=lambda p: p.name,
                )
            ]
        return [
            _with_count(p)
            for p in sorted(
                [
                    p
                    for p in self.projects
                    if p.tenant_id == claims.tenant_id and p.id in claims.project_ids
                ],
                key=lambda p: p.name,
            )
        ]

    async def get_project(self, project_id: str) -> Project | None:
        return next((p for p in self.projects if p.id == project_id), None)

    async def get_project_summary(self, claims: AuthClaims, project_id: str) -> ProjectSummary:
        project = assert_project_access(claims, await self.get_project(project_id))
        project_visits = [v for v in self.visits if v.project_id == project.id]
        unique_stores = len({v.store_id for v in project_visits})
        dates = sorted(v.visit_date for v in project_visits)

        # P1.4: No hardcoded install distributions — campaign config drives this
        install_slots: tuple = ()

        project_photos = [p for p in self.photos if p.project_id == project.id]
        photo_by_kind = {p.kind: 0 for p in project_photos}
        for photo in project_photos:
            photo_by_kind[photo.kind] = photo_by_kind.get(photo.kind, 0) + 1

        visits_with_photos = {p.instance_id for p in project_photos}
        rows_with_no_photos = len(project_visits) - len(visits_with_photos)

        return ProjectSummary(
            project_id=project.id,
            total_visits=len(project_visits),
            unique_stores=unique_stores,
            min_date=dates[0] if dates else None,
            max_date=dates[-1] if dates else None,
            metrics=tuple(self.metrics.get(project.id, [])),
            install_slots=install_slots,
            photo_by_kind=photo_by_kind,
            rows_with_no_photos=rows_with_no_photos,
        )

    async def list_visits(self, claims: AuthClaims, project_id: str) -> list[dict]:
        project = assert_project_access(claims, await self.get_project(project_id))
        visits = sorted(
            [v for v in self.visits if v.project_id == project.id],
            key=lambda v: (v.visit_date, v.instance_id),
        )
        # Compute photo counts
        project_photos = [p for p in self.photos if p.project_id == project.id]
        from collections import Counter
        photo_counts = Counter(p.instance_id for p in project_photos)

        # Convert to dict with photo_count
        result = []
        for visit in visits:
            visit_dict = to_public_dict(visit)
            visit_dict["photo_count"] = photo_counts.get(visit.instance_id, 0)
            result.append(visit_dict)
        return result

    async def get_visit(self, claims: AuthClaims, project_id: str, instance_id: str) -> Visit | None:
        project = assert_project_access(claims, await self.get_project(project_id))
        return next(
            (
                v
                for v in self.visits
                if v.project_id == project.id and v.instance_id == instance_id
            ),
            None,
        )

    async def list_photos(self, claims: AuthClaims, project_id: str, instance_id: str) -> list[VisitPhoto]:
        project = assert_project_access(claims, await self.get_project(project_id))
        return [
            p
            for p in self.photos
            if p.project_id == project.id and p.instance_id == instance_id
        ]

    async def list_tenants(self) -> list[Tenant]:
        return sorted(self.tenants, key=lambda t: t.name)

    async def list_users(self) -> list[User]:
        return sorted(self.users, key=lambda u: u.email)

    async def list_run_logs(self) -> list[RunLog]:
        return sorted(self.run_logs, key=lambda r: r.started_at, reverse=True)

    async def update_project(
        self,
        tenant_id: str,
        project_id: str,
        name: str | None,
        start_date: str | None,
        end_date: str | None,
        client_name: str | None = None,
    ) -> Project:
        from dataclasses import replace as dc_replace
        idx = next(
            (i for i, p in enumerate(self.projects) if p.id == project_id and p.tenant_id == tenant_id),
            None,
        )
        if idx is None:
            raise ValueError(f"Project '{project_id}' not found for tenant '{tenant_id}'")
        existing = self.projects[idx]
        updated = dc_replace(
            existing,
            name=name if name is not None else existing.name,
            start_date=start_date if start_date is not None else existing.start_date,
            end_date=end_date if end_date is not None else existing.end_date,
            client_name=client_name if client_name is not None else existing.client_name,
        )
        self.projects = list(self.projects)
        self.projects[idx] = updated
        return updated

    async def issue_password_reset_token(
        self,
        *,
        user_id: str,
        tenant_id: str | None,
        ttl_seconds: int = 3600,
    ) -> str:
        raise NotImplementedError("InMemoryDashboardRepository does not support password-reset tokens")

    async def consume_password_reset_token(
        self,
        *,
        user_id: str,
        raw_token: str,
        new_password: str,
        tenant_id: str | None = None,
    ) -> bool:
        raise NotImplementedError("InMemoryDashboardRepository does not support password-reset tokens")

    async def get_active_user_for_reset(self, email: str) -> dict | None:
        raise NotImplementedError("InMemoryDashboardRepository does not support password-reset tokens")

    async def list_project_metrics(self, project_id: str) -> list[dict]:
        project = await self.get_project(project_id)
        if not project:
            raise ValueError("Project not found")
        results = [
            v for (tid, pid, _key), v in self._metric_store.items()
            if tid == project.tenant_id and pid == project.id
        ]
        return sorted(results, key=lambda r: r["key"])

    async def update_project_metrics(self, project_id: str, metrics: list[dict]) -> list[dict]:
        project = await self.get_project(project_id)
        if not project:
            raise ValueError("Project not found")
        for item in metrics:
            store_key = (project.tenant_id, project.id, item["key"])
            self._metric_store[store_key] = {
                "key": item["key"],
                "label": item["label"],
                "value": item["value"],
                "unit": item.get("unit"),
                "category": item.get("category"),
            }
        return await self.list_project_metrics(project_id)

    async def get_platform_setting(self, key: str) -> str | None:
        if key == "site_title":
            return "iSN"
        return None

    async def set_platform_setting(self, key: str, value: str) -> str:
        return value

    async def list_companies(self) -> list[Company]:
        return sorted(self.companies, key=lambda c: c.name)

    async def create_company(self, company_id: str, name: str, slug: str) -> Company:
        company = Company(id=company_id, name=name, slug=slug)
        self.companies.append(company)
        return company

    async def get_company(self, company_id: str) -> Company | None:
        return next((c for c in self.companies if c.id == company_id), None)

    async def update_company(self, company_id: str, name: str | None = None, slug: str | None = None) -> Company:
        from dataclasses import replace as dc_replace
        idx = next((i for i, c in enumerate(self.companies) if c.id == company_id), None)
        if idx is None:
            raise ValueError(f"Company '{company_id}' not found")
        existing = self.companies[idx]
        updated = dc_replace(
            existing,
            name=name if name is not None else existing.name,
            slug=slug if slug is not None else existing.slug,
        )
        self.companies = list(self.companies)
        self.companies[idx] = updated
        return updated

    async def list_tenants_for_company(self, company_id: str) -> list[Tenant]:
        return sorted(
            [t for t in self.tenants if t.company_id == company_id],
            key=lambda t: t.name,
        )

    async def list_users_for_company(self, company_id: str) -> list[User]:
        return sorted(
            [u for u in self.users if u.company_id == company_id],
            key=lambda u: u.email,
        )

    async def assign_tenant_to_company(self, tenant_id: str, company_id: str) -> Tenant:
        from dataclasses import replace as dc_replace
        idx = next((i for i, t in enumerate(self.tenants) if t.id == tenant_id), None)
        if idx is None:
            raise ValueError(f"Tenant '{tenant_id}' not found")
        updated = dc_replace(self.tenants[idx], company_id=company_id)
        self.tenants = list(self.tenants)
        self.tenants[idx] = updated
        return updated

    async def list_tenants_for_admin(self, tenant_ids: tuple[str, ...]) -> list[Tenant]:
        tid_set = set(tenant_ids)
        return sorted([t for t in self.tenants if t.id in tid_set], key=lambda t: t.name)

    async def list_users_for_tenants(self, tenant_ids: tuple[str, ...]) -> list[User]:
        tid_set = set(tenant_ids)
        return sorted(
            [u for u in self.users
             if u.tenant_id in tid_set
             or bool(set(u.tenant_ids) & tid_set)],
            key=lambda u: u.email,
        )


def seed_phase01_repository(password: str = "Demo123!") -> InMemoryDashboardRepository:
    default_company = Company(id="company_default", name="Default Company", slug="default")
    tenant_a = Tenant(id="tenant_labatt", name="Brasserie Labatt", slug="brasserie-labatt", country="CA", company_id=default_company.id)
    tenant_b = Tenant(id="tenant_other", name="Other Client", slug="other-client", country="CA", company_id=default_company.id)
    project_a = Project(
        id="project_messi_flying_fish",
        tenant_id=tenant_a.id,
        name="Messi and Flying Fish",
        slug="messi-and-flying-fish",
        client_name=tenant_a.name,
        start_date="2026-03-06",
        end_date="2026-04-08",
    )
    project_b = Project(
        id="project_other",
        tenant_id=tenant_b.id,
        name="Other Tenant Project",
        slug="other-tenant-project",
        client_name=tenant_b.name,
        start_date="2026-01-01",
        end_date="2026-01-31",
    )
    users = [
        User(
            id="user_admin",
            email="admin@demo.local",
            name="Demo Admin",
            role=Role.PLATFORM_ADMIN,
            tenant_id=None,
            hashed_password=hash_password(password),
            company_id=default_company.id,
            project_ids=(),
        ),
        User(
            id="user_client_admin",
            email="clientadmin@demo.local",
            name="Client Admin",
            role=Role.CLIENT_ADMIN,
            tenant_id=None,
            hashed_password=hash_password(password),
            company_id=default_company.id,
            project_ids=(),
            tenant_ids=(tenant_a.id,),
        ),
        User(
            id="user_client",
            email="client@demo.local",
            name="Demo Client",
            role=Role.TENANT_USER,
            tenant_id=tenant_a.id,
            hashed_password=hash_password(password),
            company_id=default_company.id,
            project_ids=(project_a.id,),
        ),
        User(
            id="user_other",
            email="other@demo.local",
            name="Other Client",
            role=Role.TENANT_USER,
            tenant_id=tenant_b.id,
            hashed_password=hash_password(password),
            company_id=default_company.id,
            project_ids=(project_b.id,),
        ),
    ]
    visits = [
        Visit(
            instance_id="1745477",
            project_id=project_a.id,
            tenant_id=tenant_a.id,
            store_id="567",
            store_name="Couche-Tard",
            visit_date="2026-03-30",
            city="Beaupre",
            install1="Installe a la position B4",
            install2="Installe a la position 360",
            install3="Entierement rempli",
        ),
        Visit(
            instance_id="2000001",
            project_id=project_b.id,
            tenant_id=tenant_b.id,
            store_id="999",
            store_name="Other Store",
            visit_date="2026-01-15",
            city="Montreal",
        ),
    ]
    photos = [
        VisitPhoto(
            instance_id="1745477",
            project_id=project_a.id,
            tenant_id=tenant_a.id,
            kind="STOREFRONT",
            url="https://example.test/photo/storefront.jpg",
        )
    ]
    metrics = {
        project_a.id: [
            ProjectMetric("standeeTarget", "Standee Messi target", 450, "stores", "target")
        ]
    }
    return InMemoryDashboardRepository(
        tenants=[tenant_a, tenant_b],
        users=users,
        projects=[project_a, project_b],
        metrics=metrics,
        visits=visits,
        photos=photos,
        companies=[default_company],
    )


def seed_from_transform(
    tenant_id: str = "tenant_labatt",
    project_id: str = "project_messi_flying_fish",
    password: str = "Demo123!"
) -> InMemoryDashboardRepository:
    """Seed repository with full dataset — deprecated, use Postgres persistence."""
    raise NotImplementedError(
        "seed_from_transform is deprecated. Use the Postgres ingestion pipeline instead."
    )


def _jsonable(value: object) -> object:
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, tuple):
        return [_jsonable(item) for item in value]
    if isinstance(value, list):
        return [_jsonable(item) for item in value]
    if isinstance(value, dict):
        return {key: _jsonable(item) for key, item in value.items()}
    return value


def to_public_dict(value: object) -> dict:
    data = _jsonable(asdict(value))
    data.pop("hashed_password", None)
    return data


# S4: Fields that must never appear in client-facing visit / photo responses.
# tenant_id and project_id are internal routing keys — the client already
# knows the project it requested via the URL path, and must never receive
# cross-tenant identifiers it could use to probe other tenants.
_VISIT_INTERNAL_FIELDS = frozenset({"tenant_id", "project_id"})


def to_client_visit_dict(value: object) -> dict:
    """Serialize a Visit or VisitPhoto for a client-facing REST response.

    Identical to to_public_dict but additionally strips tenant_id and
    project_id. Use this in projects.py routes only — admin routes that
    legitimately need those fields should continue using to_public_dict.
    """
    data = to_public_dict(value)
    for field_name in _VISIT_INTERNAL_FIELDS:
        data.pop(field_name, None)
    return data
