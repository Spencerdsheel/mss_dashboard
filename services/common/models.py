from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any


class Role(str, Enum):
    PLATFORM_ADMIN = "PLATFORM_ADMIN"
    CLIENT_ADMIN = "CLIENT_ADMIN"
    TENANT_USER = "TENANT_USER"


# Backward compat for existing JWT tokens and DB rows during migration
_ROLE_MIGRATION: dict[str, Role] = {
    "ADMIN": Role.PLATFORM_ADMIN,
    "CLIENT": Role.TENANT_USER,
}


def resolve_role(raw: str) -> Role:
    """Resolve a role string to a Role enum, handling legacy values."""
    try:
        return Role(raw)
    except ValueError:
        migrated = _ROLE_MIGRATION.get(raw)
        if migrated is not None:
            return migrated
        raise ValueError(f"Unknown role: {raw!r}")


@dataclass(frozen=True)
class AuthClaims:
    user_id: str
    role: Role
    tenant_id: str | None
    company_id: str | None = None
    project_ids: tuple[str, ...] = field(default_factory=tuple)
    email: str | None = None


@dataclass(frozen=True)
class Company:
    id: str
    name: str
    slug: str
    status: str = "active"


@dataclass(frozen=True)
class Tenant:
    id: str
    name: str
    slug: str
    country: str | None = None
    status: str = "active"
    company_id: str | None = None


@dataclass(frozen=True)
class User:
    id: str
    email: str
    name: str | None
    role: Role
    tenant_id: str | None
    hashed_password: str
    company_id: str | None = None
    project_ids: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class Project:
    id: str
    tenant_id: str
    name: str
    slug: str
    client_name: str
    locale: str = "fr-CA"
    provider_kind: str = "sample"
    start_date: str | None = None
    end_date: str | None = None
    visit_count: int = 0


@dataclass(frozen=True)
class ProjectMetric:
    key: str
    label: str
    value: float
    unit: str | None = None
    category: str | None = None


@dataclass(frozen=True)
class DistributionEntry:
    label: str
    value: int
    is_success: bool = False


@dataclass(frozen=True)
class InstallSlot:
    slot_index: int
    title: str
    question: str
    target: int | None
    success_count: int = 0
    distribution: tuple[DistributionEntry, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class InstallCategory:
    slot_index: int
    position: int
    label: str
    is_success: bool = False


@dataclass(frozen=True)
class ProjectSummary:
    project_id: str
    total_visits: int
    unique_stores: int
    min_date: str | None
    max_date: str | None
    metrics: tuple[ProjectMetric, ...] = field(default_factory=tuple)
    install_slots: tuple[InstallSlot, ...] = field(default_factory=tuple)
    photo_by_kind: dict[str, int] = field(default_factory=dict)
    rows_with_no_photos: int = 0


@dataclass(frozen=True)
class Visit:
    instance_id: str
    project_id: str
    tenant_id: str
    store_id: str
    store_name: str
    visit_date: str
    visit_time: str | None = None
    city: str | None = None
    address: str | None = None
    clerk_name: str | None = None
    install1: str | None = None
    install2: str | None = None
    install3: str | None = None
    install4: str | None = None
    overall_notes: str | None = None


@dataclass(frozen=True)
class VisitPhoto:
    instance_id: str
    project_id: str
    tenant_id: str
    kind: str
    url: str
    caption: str | None = None


@dataclass(frozen=True)
class ProviderConnection:
    tenant_id: str
    project_id: str
    kind: str
    status: str
    display_name: str | None = None
    config: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class RunLog:
    id: str
    tenant_id: str
    status: str
    started_at: datetime
    finished_at: datetime | None = None
    rows_pulled: int = 0
    error_message: str | None = None
