from __future__ import annotations

from .models import AuthClaims, Project, Role


class AuthorizationError(Exception):
    """Raised when a user is authenticated but not allowed to act."""


def require_platform_admin(claims: AuthClaims) -> None:
    """Requires PLATFORM_ADMIN role."""
    if claims.role != Role.PLATFORM_ADMIN:
        raise AuthorizationError("Platform admin role required")


def require_client_admin_or_above(claims: AuthClaims) -> None:
    """Requires CLIENT_ADMIN or PLATFORM_ADMIN."""
    if claims.role not in (Role.PLATFORM_ADMIN, Role.CLIENT_ADMIN):
        raise AuthorizationError("Client admin or higher role required")


# Backward compat alias used by admin.py routes (updated in Sprint 07b)
require_admin = require_platform_admin


def can_access_project(claims: AuthClaims, project: Project | None) -> bool:
    if project is None:
        return False
    if claims.role == Role.PLATFORM_ADMIN:
        return True
    if claims.role == Role.CLIENT_ADMIN:
        # CLIENT_ADMIN is scoped by the tenants assigned to them (Sprint 07b: tenant_ids
        # array). This matches list_projects and the admin route guards, so a project the
        # CLIENT_ADMIN can list is also one they can read.
        return project.tenant_id in claims.tenant_ids
    if claims.role == Role.TENANT_USER:
        if claims.tenant_id is None:
            return False
        if project.tenant_id != claims.tenant_id:
            return False
        return project.id in claims.project_ids
    return False


def assert_project_access(claims: AuthClaims, project: Project | None) -> Project:
    if not can_access_project(claims, project):
        raise AuthorizationError("Project not found or not accessible")
    return project
