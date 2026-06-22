from __future__ import annotations

from .models import AuthClaims, Project, Role


class AuthorizationError(Exception):
    """Raised when a user is authenticated but not allowed to act."""


def require_admin(claims: AuthClaims) -> None:
    if claims.role != Role.ADMIN:
        raise AuthorizationError("Admin role required")


def can_access_project(claims: AuthClaims, project: Project | None) -> bool:
    if project is None:
        return False
    if claims.role == Role.ADMIN:
        return True
    if claims.tenant_id is None:
        return False
    if project.tenant_id != claims.tenant_id:
        return False
    return project.id in claims.project_ids


def assert_project_access(claims: AuthClaims, project: Project | None) -> Project:
    if not can_access_project(claims, project):
        raise AuthorizationError("Project not found or not accessible")
    return project
