"""Tests for Sprint 13a/13b dashboard-layout repository methods.

Uses InMemoryDashboardRepository (no live Postgres needed in this test env —
consistent with test_get_project_scoped.py). Covers:
  - 13a: get_dashboard_layout tenant scoping + null-when-absent.
  - 13b: upsert_dashboard_layout / delete_dashboard_layout write isolation.

No pytest-asyncio plugin is installed, so async repository calls are driven
via asyncio.run() inside plain sync tests (same pattern as the rest of
backend_tests).
"""

import asyncio

import pytest
from fastapi import HTTPException

from services.common.models import AuthClaims, Project, Role, Tenant
from services.common.repository import InMemoryDashboardRepository
from services.common.tenancy import AuthorizationError
from services.api.routes.projects import get_dashboard_layout as get_dashboard_layout_route


def _repo_with_two_tenants() -> InMemoryDashboardRepository:
    tenant_a = Tenant(id="tenant_a", name="Tenant A", slug="tenant-a")
    tenant_b = Tenant(id="tenant_b", name="Tenant B", slug="tenant-b")
    project_a = Project(id="proj_a", tenant_id="tenant_a", name="A Project", slug="a", client_name="A")
    project_b = Project(id="proj_b", tenant_id="tenant_b", name="B Project", slug="b", client_name="B")
    return InMemoryDashboardRepository(
        tenants=[tenant_a, tenant_b],
        users=[],
        projects=[project_a, project_b],
    )


def _claims(role: Role, tenant_id: str | None, project_ids: tuple = (), tenant_ids: tuple = ()) -> AuthClaims:
    return AuthClaims(
        user_id="u1",
        role=role,
        tenant_id=tenant_id,
        project_ids=project_ids,
        tenant_ids=tenant_ids,
    )


class TestGetDashboardLayoutNullWhenAbsent:
    def test_returns_none_when_no_layout_stored(self):
        repo = _repo_with_two_tenants()
        claims = _claims(Role.TENANT_USER, "tenant_a", project_ids=("proj_a",))
        result = asyncio.run(repo.get_dashboard_layout(claims, "proj_a"))
        assert result is None

    def test_returns_stored_layout(self):
        repo = _repo_with_two_tenants()
        admin_claims = _claims(Role.PLATFORM_ADMIN, None)
        asyncio.run(
            repo.upsert_dashboard_layout(
                admin_claims, "proj_a", {"version": 1, "widgets": []}, "manual", "admin_user"
            )
        )
        claims = _claims(Role.TENANT_USER, "tenant_a", project_ids=("proj_a",))
        result = asyncio.run(repo.get_dashboard_layout(claims, "proj_a"))
        assert result is not None
        assert result.layout == {"version": 1, "widgets": []}
        assert result.source == "manual"
        assert result.tenant_id == "tenant_a"

    def test_pages_store_independent_layouts_for_the_same_project(self):
        repo = _repo_with_two_tenants()
        claims = _claims(Role.PLATFORM_ADMIN, None)
        asyncio.run(repo.upsert_dashboard_layout(claims, "proj_a", {"version": 1, "widgets": []}, "manual", "u1", "overview"))
        asyncio.run(repo.upsert_dashboard_layout(claims, "proj_a", {"version": 2, "cols": 12, "widgets": []}, "manual", "u1", "locations"))
        overview = asyncio.run(repo.get_dashboard_layout(claims, "proj_a", "overview"))
        locations = asyncio.run(repo.get_dashboard_layout(claims, "proj_a", "locations"))
        assert overview is not None and locations is not None
        assert overview.page_key == "overview" and locations.page_key == "locations"
        assert overview.layout["version"] == 1 and locations.layout["version"] == 2

    def test_unknown_page_route_is_rejected_with_422(self):
        repo = _repo_with_two_tenants()
        claims = _claims(Role.PLATFORM_ADMIN, None)
        with pytest.raises(HTTPException) as exc:
            asyncio.run(get_dashboard_layout_route("proj_a", "unknown", claims, repo))
        assert exc.value.status_code == 422


class TestDashboardLayoutTenantIsolation:
    def test_tenant_user_cannot_read_foreign_tenant_layout(self):
        repo = _repo_with_two_tenants()
        # tenant_a user has no project_ids granting proj_b
        claims = _claims(Role.TENANT_USER, "tenant_a", project_ids=("proj_a",))
        with pytest.raises(AuthorizationError):
            asyncio.run(repo.get_dashboard_layout(claims, "proj_b"))

    def test_client_admin_scoped_to_own_tenant_ids(self):
        repo = _repo_with_two_tenants()
        claims = _claims(Role.CLIENT_ADMIN, None, tenant_ids=("tenant_a",))
        with pytest.raises(AuthorizationError):
            asyncio.run(repo.get_dashboard_layout(claims, "proj_b"))

    def test_client_admin_of_tenant_a_cannot_write_tenant_b_layout(self):
        repo = _repo_with_two_tenants()
        claims = _claims(Role.CLIENT_ADMIN, None, tenant_ids=("tenant_a",))
        with pytest.raises(AuthorizationError):
            asyncio.run(
                repo.upsert_dashboard_layout(
                    claims, "proj_b", {"version": 1, "widgets": []}, "manual", "u1"
                )
            )

    def test_platform_admin_can_read_any_tenant_layout(self):
        repo = _repo_with_two_tenants()
        claims = _claims(Role.PLATFORM_ADMIN, None)
        # No row stored yet -> still authorized, just returns None.
        result = asyncio.run(repo.get_dashboard_layout(claims, "proj_b"))
        assert result is None


class TestDeleteDashboardLayout:
    def test_reset_deletes_row_and_subsequent_get_is_none(self):
        repo = _repo_with_two_tenants()
        admin_claims = _claims(Role.PLATFORM_ADMIN, None)
        asyncio.run(
            repo.upsert_dashboard_layout(
                admin_claims, "proj_a", {"version": 1, "widgets": []}, "manual", "admin_user"
            )
        )
        asyncio.run(repo.delete_dashboard_layout(admin_claims, "proj_a"))
        result = asyncio.run(repo.get_dashboard_layout(admin_claims, "proj_a"))
        assert result is None

    def test_tenant_b_admin_cannot_delete_tenant_a_layout(self):
        repo = _repo_with_two_tenants()
        admin_claims = _claims(Role.PLATFORM_ADMIN, None)
        asyncio.run(
            repo.upsert_dashboard_layout(
                admin_claims, "proj_a", {"version": 1, "widgets": []}, "manual", "admin_user"
            )
        )
        tenant_b_admin = _claims(Role.CLIENT_ADMIN, None, tenant_ids=("tenant_b",))
        with pytest.raises(AuthorizationError):
            asyncio.run(repo.delete_dashboard_layout(tenant_b_admin, "proj_a"))
