"""Tests for sprint-16 §4.3: GET /auth/me returning a tenant-scoped company_name.

The company name is resolved strictly from the caller's own verified JWT claim
(claims.company_id) via the existing DashboardRepository.get_company() read
path — never from a query/path/body param (tenant-isolation red line). These
tests exercise the route handler's resolution logic directly against the
in-memory repository, matching this repo's existing pattern of driving async
repository calls via asyncio.run() rather than a pytest-asyncio plugin (see
backend_tests/test_get_project_scoped.py).
"""

import asyncio

from services.api.routes.auth import me
from services.common.models import AuthClaims, Company, Role
from services.common.repository import InMemoryDashboardRepository


def _repo_with_company() -> InMemoryDashboardRepository:
    company = Company(id="company_acme", name="Acme Corp", slug="acme")
    return InMemoryDashboardRepository(
        tenants=[], users=[], projects=[], companies=[company]
    )


class TestAuthMeCompanyName:
    def test_tenant_user_gets_own_company_name(self):
        repo = _repo_with_company()
        claims = AuthClaims(
            user_id="u1",
            role=Role.TENANT_USER,
            tenant_id="tenant_a",
            company_id="company_acme",
            email="user@acme.com",
        )
        result = asyncio.run(me(claims=claims, repository=repo))
        assert result["company_name"] == "Acme Corp"

    def test_unknown_company_id_resolves_to_none(self):
        repo = _repo_with_company()
        claims = AuthClaims(
            user_id="u2",
            role=Role.TENANT_USER,
            tenant_id="tenant_b",
            company_id="company_does_not_exist",
            email="user@other.com",
        )
        result = asyncio.run(me(claims=claims, repository=repo))
        assert result["company_name"] is None

    def test_platform_admin_with_no_company_id_gets_none(self):
        # PLATFORM_ADMIN sessions may span tenants and have no single
        # resolvable company_id — the frontend applies its own "iSN Admin"
        # fallback label in this case; the backend simply returns null.
        repo = _repo_with_company()
        claims = AuthClaims(
            user_id="u3",
            role=Role.PLATFORM_ADMIN,
            tenant_id=None,
            company_id=None,
            email="admin@isngs.com",
        )
        result = asyncio.run(me(claims=claims, repository=repo))
        assert result["company_name"] is None

    def test_company_lookup_never_accepts_request_supplied_id(self):
        # Regression guard for the tenant-isolation red line: the `me` handler
        # signature takes no company_id parameter at all — it can only ever
        # resolve from claims.company_id, which is itself derived from the
        # verified JWT server-side (get_current_claims), never request input.
        import inspect

        params = inspect.signature(me).parameters
        assert "company_id" not in params
