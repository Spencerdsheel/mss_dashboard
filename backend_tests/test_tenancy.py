"""Tests for services/common/tenancy.py — project access control."""

import pytest

from services.common.models import AuthClaims, Project, Role
from services.common.tenancy import (
    AuthorizationError,
    assert_project_access,
    can_access_project,
    require_admin,
)

ADMIN_CLAIMS = AuthClaims(user_id="u-admin", role=Role.ADMIN, tenant_id=None)
CLIENT_CLAIMS_OWNED = AuthClaims(
    user_id="u-client",
    role=Role.CLIENT,
    tenant_id="tenant_labatt",
    project_ids=("proj_messi",),
)
CLIENT_CLAIMS_FOREIGN = AuthClaims(
    user_id="u-client2",
    role=Role.CLIENT,
    tenant_id="tenant_other",
    project_ids=("proj_other",),
)

OWNED_PROJECT = Project(
    id="proj_messi",
    tenant_id="tenant_labatt",
    name="Messi and Flying Fish",
    slug="messi-flying-fish",
    client_name="Brasserie Labatt",
)
FOREIGN_PROJECT = Project(
    id="proj_other",
    tenant_id="tenant_other",
    name="Other Project",
    slug="other",
    client_name="Other Client",
)


class TestRequireAdmin:
    def test_admin_passes(self):
        require_admin(ADMIN_CLAIMS)  # should not raise

    def test_client_raises(self):
        with pytest.raises(AuthorizationError, match="Admin role"):
            require_admin(CLIENT_CLAIMS_OWNED)


class TestCanAccessProject:
    def test_admin_can_access_any_project(self):
        assert can_access_project(ADMIN_CLAIMS, OWNED_PROJECT) is True
        assert can_access_project(ADMIN_CLAIMS, FOREIGN_PROJECT) is True

    def test_client_can_access_owned_project(self):
        assert can_access_project(CLIENT_CLAIMS_OWNED, OWNED_PROJECT) is True

    def test_client_cannot_access_foreign_project(self):
        assert can_access_project(CLIENT_CLAIMS_FOREIGN, OWNED_PROJECT) is False

    def test_client_cannot_access_project_on_different_tenant(self):
        # Same project ID but different tenant
        cross_tenant = Project(
            id="proj_messi",
            tenant_id="tenant_other",
            name="Messi",
            slug="messi",
            client_name="Other",
        )
        assert can_access_project(CLIENT_CLAIMS_OWNED, cross_tenant) is False

    def test_none_project_returns_false(self):
        assert can_access_project(ADMIN_CLAIMS, None) is False
        assert can_access_project(CLIENT_CLAIMS_OWNED, None) is False

    def test_client_without_tenant_id_cannot_access(self):
        claims = AuthClaims(user_id="u-bad", role=Role.CLIENT, tenant_id=None, project_ids=("proj_messi",))
        assert can_access_project(claims, OWNED_PROJECT) is False


class TestAssertProjectAccess:
    def test_admin_assert_succeeds(self):
        result = assert_project_access(ADMIN_CLAIMS, OWNED_PROJECT)
        assert result is OWNED_PROJECT

    def test_client_assert_owned_succeeds(self):
        result = assert_project_access(CLIENT_CLAIMS_OWNED, OWNED_PROJECT)
        assert result is OWNED_PROJECT

    def test_client_assert_foreign_raises(self):
        with pytest.raises(AuthorizationError, match="not accessible"):
            assert_project_access(CLIENT_CLAIMS_FOREIGN, OWNED_PROJECT)

    def test_assert_none_project_raises(self):
        with pytest.raises(AuthorizationError, match="not accessible"):
            assert_project_access(ADMIN_CLAIMS, None)
