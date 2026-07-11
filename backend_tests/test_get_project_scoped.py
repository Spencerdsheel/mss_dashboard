"""Tests for the get_project composite-key fix (Sprint PERF Task 2.2).

Uses the in-memory repository to verify that get_project(project_id,
tenant_ids) resolves the *correct* tenant's row when two tenants happen to
share a project_id — the original bug picked whichever tenant's row sorted
first, silently leaking cross-tenant data.

No pytest-asyncio plugin is installed in this environment, so async
repository calls are driven via asyncio.run() inside plain sync tests
(consistent with how the rest of backend_tests avoids that dependency).
"""

import asyncio

from services.common.models import AuthClaims, Project, Role, Tenant
from services.common.repository import InMemoryDashboardRepository
from services.common.tenancy import tenant_scope


def _repo_with_shared_project_id() -> InMemoryDashboardRepository:
    tenant_a = Tenant(id="tenant_a", name="Tenant A", slug="tenant-a")
    tenant_b = Tenant(id="tenant_b", name="Tenant B", slug="tenant-b")
    # Both tenants have a project with the SAME project_id — this is the
    # exact scenario the composite-key bug mishandled.
    project_a = Project(id="P1", tenant_id="tenant_a", name="A's P1", slug="p1", client_name="A")
    project_b = Project(id="P1", tenant_id="tenant_b", name="B's P1", slug="p1", client_name="B")
    return InMemoryDashboardRepository(
        tenants=[tenant_a, tenant_b],
        users=[],
        projects=[project_a, project_b],
    )


class TestTenantScope:
    def test_platform_admin_unrestricted(self):
        claims = AuthClaims(user_id="u", role=Role.PLATFORM_ADMIN, tenant_id=None)
        assert tenant_scope(claims) is None

    def test_client_admin_scoped_to_tenant_ids(self):
        claims = AuthClaims(
            user_id="u", role=Role.CLIENT_ADMIN, tenant_id=None, tenant_ids=("tenant_a", "tenant_c")
        )
        assert tenant_scope(claims) == ["tenant_a", "tenant_c"]

    def test_tenant_user_scoped_to_own_tenant(self):
        claims = AuthClaims(user_id="u", role=Role.TENANT_USER, tenant_id="tenant_a")
        assert tenant_scope(claims) == ["tenant_a"]

    def test_tenant_user_without_tenant_returns_empty(self):
        claims = AuthClaims(user_id="u", role=Role.TENANT_USER, tenant_id=None)
        assert tenant_scope(claims) == []


class TestGetProjectCompositeKey:
    def test_tenant_b_resolves_their_own_p1(self):
        repo = _repo_with_shared_project_id()
        project = asyncio.run(repo.get_project("P1", tenant_ids=["tenant_b"]))
        assert project is not None
        assert project.tenant_id == "tenant_b"
        assert project.name == "B's P1"

    def test_tenant_a_resolves_their_own_p1(self):
        repo = _repo_with_shared_project_id()
        project = asyncio.run(repo.get_project("P1", tenant_ids=["tenant_a"]))
        assert project is not None
        assert project.tenant_id == "tenant_a"
        assert project.name == "A's P1"

    def test_client_admin_cannot_resolve_foreign_tenant_project(self):
        repo = _repo_with_shared_project_id()
        # CLIENT_ADMIN of tenant_a only -> cannot see tenant_b's P1
        project = asyncio.run(repo.get_project("P1", tenant_ids=["tenant_a"]))
        assert project is not None and project.tenant_id != "tenant_b"

    def test_empty_tenant_list_always_none(self):
        repo = _repo_with_shared_project_id()
        assert asyncio.run(repo.get_project("P1", tenant_ids=[])) is None

    def test_platform_admin_cross_tenant_lookup(self):
        repo = _repo_with_shared_project_id()
        project = asyncio.run(repo.get_project("P1", tenant_ids=None))
        # Unrestricted: resolves *a* row (deterministic first-match), which is
        # fine for PLATFORM_ADMIN cross-tenant tooling.
        assert project is not None
        assert project.id == "P1"

    def test_unknown_project_id_returns_none(self):
        repo = _repo_with_shared_project_id()
        assert asyncio.run(repo.get_project("does-not-exist", tenant_ids=["tenant_a"])) is None
