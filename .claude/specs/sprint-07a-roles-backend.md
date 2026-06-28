# Sprint 07a — Three-tier roles: DB migration + backend foundation + admin title fix

> **Author:** Opus (planner). **Implementer:** Qwen 3.5 via opencode. **Verifier:** Sonnet.
> Read `qwen_implementation_guide.md` + `CLAUDE.md` first. Do **not** git-commit.
>
> **This is 07a of a 2-part sprint.** This part covers: DB schema, backend models, security,
> tenancy, repository, and the admin page title fix. Sprint 07b covers API routes + frontend.

## 1. Goal

Lay the backend foundation for three-tier roles:

| Role | Who | Scope |
|------|-----|-------|
| `PLATFORM_ADMIN` | iSN team | All companies, tenants, projects |
| `CLIENT_ADMIN` | Mystery shopping company | All tenants under their company |
| `TENANT_USER` | Brasserie Labatt (tenant) | Only assigned projects in their tenant |

Also fix the admin page header showing "iSN" instead of the DB-configured site title.

**After this sprint:** The database supports companies, all three roles exist in the backend,
JWT tokens carry `company_id`, backward compat maps old ADMIN/CLIENT tokens, and the admin
page header shows the correct site title. Frontend is unchanged (07b).

## 2. Scope

### Files to edit:
- `services/ingestion/dashboard_schema.sql` — add companies table, alter tenants/users
- `services/common/models.py` — Role enum, AuthClaims, Company dataclass, Tenant update
- `services/common/security.py` — JWT creation/decoding with company_id + role migration
- `services/common/tenancy.py` — new role-aware access checks
- `services/common/postgres_repository.py` — Company CRUD, role-aware tenant/project queries
- `services/common/repository.py` — Protocol updates for new methods
- `src/app/admin/layout.tsx` — fetch and pass siteTitle to AppShell

### New file:
- `services/ingestion/migrations/001_add_companies.sql` — idempotent migration script

### Do NOT touch:
- `services/api/routes/admin.py` — API route changes are in Sprint 07b
- `services/api/routes/auth.py` — auth routes unchanged (login still works)
- Any frontend files except `src/app/admin/layout.tsx`
- Test files (will be updated in 07b)

## 3. Implementation details

### 3a. Database schema — companies table + FK columns

**File:** `services/ingestion/dashboard_schema.sql`

Add the companies table **before** the tenants table (it's referenced by FK):

```sql
CREATE TABLE IF NOT EXISTS dashboard.companies (
    company_id   TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    slug         TEXT NOT NULL UNIQUE,
    status       TEXT NOT NULL DEFAULT 'active',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Insert this block at line 3 (after `CREATE SCHEMA IF NOT EXISTS dashboard;`, before the
tenants table).

Add `company_id` column to tenants table. After the existing `locale` column definition
(line 7), add:
```sql
    company_id TEXT REFERENCES dashboard.companies(company_id),
```

Add `company_id` column to users table. After the existing `tenant_id` column definition
(line 109), add:
```sql
    company_id TEXT REFERENCES dashboard.companies(company_id),
```

### 3b. Migration script (live DB)

**New file:** `services/ingestion/migrations/001_add_companies.sql`

```sql
-- Sprint 07a: Add companies table and link to tenants/users
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS dashboard.companies (
    company_id   TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    slug         TEXT NOT NULL UNIQUE,
    status       TEXT NOT NULL DEFAULT 'active',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add company_id FK to tenants and users
ALTER TABLE dashboard.tenants
    ADD COLUMN IF NOT EXISTS company_id TEXT REFERENCES dashboard.companies(company_id);

ALTER TABLE dashboard.users
    ADD COLUMN IF NOT EXISTS company_id TEXT REFERENCES dashboard.companies(company_id);

-- Seed a default company for existing data
INSERT INTO dashboard.companies (company_id, name, slug)
VALUES ('company_default', 'Default Company', 'default')
ON CONFLICT DO NOTHING;

-- Assign existing tenants to the default company
UPDATE dashboard.tenants SET company_id = 'company_default' WHERE company_id IS NULL;

-- Migrate existing roles:
--   ADMIN -> PLATFORM_ADMIN
--   CLIENT -> TENANT_USER
UPDATE dashboard.users SET role = 'PLATFORM_ADMIN' WHERE role = 'ADMIN';
UPDATE dashboard.users SET role = 'TENANT_USER' WHERE role = 'CLIENT';

-- Assign CLIENT_ADMIN-eligible users a company_id
-- (All TENANT_USERs get the default company via their tenant)
UPDATE dashboard.users u
SET company_id = t.company_id
FROM dashboard.tenants t
WHERE u.tenant_id = t.tenant_id AND u.company_id IS NULL;
```

**Important:** The user runs this migration manually against the live DB. Qwen does NOT run it.

### 3c. Backend models

**File:** `services/common/models.py`

#### Role enum (lines 9-11) — replace entirely:

```python
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
```

#### AuthClaims (lines 14-20) — add `company_id`:

```python
@dataclass(frozen=True)
class AuthClaims:
    user_id: str
    role: Role
    tenant_id: str | None
    company_id: str | None = None
    project_ids: tuple[str, ...] = field(default_factory=tuple)
    email: str | None = None
```

#### New Company dataclass — add after the AuthClaims class (before Tenant):

```python
@dataclass(frozen=True)
class Company:
    id: str
    name: str
    slug: str
    status: str = "active"
```

#### Tenant dataclass (lines 23-29) — add `company_id`:

```python
@dataclass(frozen=True)
class Tenant:
    id: str
    name: str
    slug: str
    country: str | None = None
    status: str = "active"
    company_id: str | None = None
```

#### User dataclass (lines 32-40) — add `company_id`:

```python
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
```

### 3d. Security / JWT

**File:** `services/common/security.py`

#### Import `resolve_role` (line 16):

Change:
```python
from .models import AuthClaims, Role, User
```
To:
```python
from .models import AuthClaims, Role, User, resolve_role
```

#### `create_access_token()` (lines 54-77) — add `company_id` to payload:

After `"project_ids": list(user.project_ids),` (line 67), add:
```python
        "company_id": user.company_id,
```

#### `decode_access_token()` (lines 126-178) — use `resolve_role()` + read `company_id`:

Replace the try block (lines 156-178) with:

```python
    try:
        role = resolve_role(str(payload["role"]))
        project_ids = tuple(str(p) for p in payload.get("project_ids", []))
        tenant_id = payload.get("tenant_id")
        company_id = payload.get("company_id")

        # TENANT_USER tokens must carry a tenant_id claim.
        # A TENANT_USER token without tenant_id would bypass tenant isolation.
        if role == Role.TENANT_USER and not tenant_id:
            raise AuthError("TENANT_USER token missing required tenant_id claim")

        # CLIENT_ADMIN tokens must carry a company_id claim.
        if role == Role.CLIENT_ADMIN and not company_id:
            raise AuthError("CLIENT_ADMIN token missing required company_id claim")

        return AuthClaims(
            user_id=str(payload["sub"]),
            email=payload.get("email"),
            role=role,
            tenant_id=str(tenant_id) if tenant_id is not None else None,
            company_id=str(company_id) if company_id is not None else None,
            project_ids=project_ids,
        )
    except AuthError:
        raise
    except (KeyError, ValueError, TypeError) as exc:
        raise AuthError("Invalid token claims") from exc
```

**Critical:** The old check `if role == Role.CLIENT and not tenant_id` becomes
`if role == Role.TENANT_USER and not tenant_id`. Old CLIENT tokens are mapped to
TENANT_USER by `resolve_role()`, so the check still fires for them.

### 3e. Tenancy — role-aware access checks

**File:** `services/common/tenancy.py`

Replace the entire file:

```python
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


def can_access_project(
    claims: AuthClaims,
    project: Project | None,
    *,
    tenant_company_id: str | None = None,
) -> bool:
    if project is None:
        return False
    if claims.role == Role.PLATFORM_ADMIN:
        return True
    if claims.role == Role.CLIENT_ADMIN:
        # CLIENT_ADMIN can see projects in tenants belonging to their company.
        # The caller must pass the tenant's company_id for verification.
        if tenant_company_id is None or claims.company_id is None:
            return False
        return tenant_company_id == claims.company_id
    if claims.role == Role.TENANT_USER:
        if claims.tenant_id is None:
            return False
        if project.tenant_id != claims.tenant_id:
            return False
        return project.id in claims.project_ids
    return False


def assert_project_access(
    claims: AuthClaims,
    project: Project | None,
    *,
    tenant_company_id: str | None = None,
) -> Project:
    if not can_access_project(claims, project, tenant_company_id=tenant_company_id):
        raise AuthorizationError("Project not found or not accessible")
    return project
```

**Important for backward compat:** `require_admin` is aliased to `require_platform_admin`.
The admin.py routes currently import and call `require_admin()` — this alias ensures they
still work without changes until Sprint 07b updates the API layer.

### 3f. Repository — Company CRUD + model updates

**File:** `services/common/postgres_repository.py`

This file is large. Make these targeted changes:

#### 1. Import `resolve_role` and `Company`:

Update the import from `.models` (find the existing import line) to include:
```python
from .models import (
    AuthClaims, Company, Role, User, Tenant, Project, ...existing imports...,
    resolve_role,
)
```

#### 2. `user_from_row()` helper — add `company_id`:

Find the existing `user_from_row` function. It currently creates a User without `company_id`.
Add `company_id=row.get("company_id")` to the User constructor.

#### 3. `tenant_from_row()` helper — add `company_id`:

Find the existing `tenant_from_row` function. Add `company_id=row.get("company_id")`.

#### 4. Role resolution in `user_from_row`:

The existing code does `role=Role(row["role"])`. Change to `role=resolve_role(row["role"])`.
This handles DB rows that still have "ADMIN" or "CLIENT" before migration runs.

#### 5. Add `company_from_row()` helper:

```python
def company_from_row(row: dict) -> Company:
    return Company(
        id=row["company_id"],
        name=row["name"],
        slug=row["slug"],
        status=row.get("status", "active"),
    )
```

#### 6. Add Company CRUD methods to `PostgresDashboardRepository`:

```python
async def list_companies(self) -> list[Company]:
    rows = await self._fetch_all(
        "SELECT * FROM dashboard.companies ORDER BY name ASC"
    )
    return [company_from_row(r) for r in rows]

async def create_company(self, company_id: str, name: str, slug: str) -> Company:
    row = await self._fetch_one(
        """INSERT INTO dashboard.companies (company_id, name, slug)
           VALUES ($1, $2, $3)
           RETURNING *""",
        company_id, name, slug,
    )
    return company_from_row(row)

async def get_company(self, company_id: str) -> Company | None:
    row = await self._fetch_one(
        "SELECT * FROM dashboard.companies WHERE company_id = $1",
        company_id,
    )
    return company_from_row(row) if row else None

async def update_company(self, company_id: str, name: str | None = None, slug: str | None = None) -> Company:
    row = await self._fetch_one(
        """UPDATE dashboard.companies
           SET name = COALESCE($2, name),
               slug = COALESCE($3, slug),
               updated_at = now()
           WHERE company_id = $1
           RETURNING *""",
        company_id, name, slug,
    )
    return company_from_row(row)
```

#### 7. Update `create_user()` — include `company_id` in INSERT:

Find the `create_user` method. The INSERT SQL currently inserts
`(user_id, email, name, role, tenant_id, project_ids, hashed_password)`.

Add `company_id` to the column list and parameter list. The `company_id` value
should be passed as a parameter to `create_user()`.

#### 8. Update `update_user()` — include `company_id` in UPDATE:

Find the `update_user` method. Add `company_id = COALESCE($N, company_id)` to the SET
clause, with a new parameter.

#### 9. Update `list_tenants()` query — include `company_id` in SELECT:

Find the `list_tenants` method (or `_list_all_tenants`). Make sure the SELECT includes
`company_id` so `tenant_from_row()` can read it.

#### 10. Add `list_tenants_for_company()` method:

```python
async def list_tenants_for_company(self, company_id: str) -> list[Tenant]:
    rows = await self._fetch_all(
        """SELECT * FROM dashboard.tenants
           WHERE company_id = $1
           ORDER BY name ASC""",
        company_id,
    )
    return [tenant_from_row(r) for r in rows]
```

### 3g. Protocol updates

**File:** `services/common/repository.py`

Add these method signatures to the `DashboardRepository` Protocol class:

```python
async def list_companies(self) -> list[Company]: ...
async def create_company(self, company_id: str, name: str, slug: str) -> Company: ...
async def get_company(self, company_id: str) -> Company | None: ...
async def update_company(self, company_id: str, name: str | None = None, slug: str | None = None) -> Company: ...
async def list_tenants_for_company(self, company_id: str) -> list[Tenant]: ...
```

Import `Company` from `.models` if not already imported.

Also update the `InMemoryDashboardRepository` class to implement these methods (simple
in-memory dict storage).

### 3h. Admin page title fix

**File:** `src/app/admin/layout.tsx`

The admin layout currently renders AppShell without `siteTitle`, so admin pages show "iSN"
instead of the DB-configured title. Copy the same fetch pattern from `dashboard/layout.tsx`:

```tsx
import { requireAdmin } from "@/server/rbac";
import { AppShell } from "@/components/app-shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();

  let siteTitle = "iSN";
  try {
    const baseUrl = process.env.BACKEND_API_URL ?? "http://localhost:8010";
    const resp = await fetch(`${baseUrl}/auth/settings/public/site_title`, {
      next: { revalidate: 60 },
    });
    if (resp.ok) {
      const data = await resp.json();
      siteTitle = data.value || "iSN";
    }
  } catch {
    // Fall back to default title
  }

  return (
    <AppShell session={session as any} siteTitle={siteTitle}>
      {children}
    </AppShell>
  );
}
```

## 4. Red lines

- **Tenant isolation (CLAUDE.md S5.1):** `tenant_id` and `company_id` come ONLY from JWT
  claims. Never from request body/query/headers. The `can_access_project` function now takes
  `tenant_company_id` as a parameter — but this must be looked up from the DB by the caller
  (repository layer), never from user input.
- **No silent fallbacks (CLAUDE.md S5.2):** Role check failures return explicit errors/403.
- **Backward compat:** Old JWT tokens with "ADMIN"/"CLIENT" roles MUST still work via
  `resolve_role()`. Existing users can log in without re-creating accounts.
- **Passwords (CLAUDE.md S5.4):** PBKDF2-SHA256 120k iterations unchanged.

## 5. Verification gates

```bash
# Backend tests must pass
conda activate venv
python -m pytest backend_tests -v

# Frontend (admin title fix only — no other frontend changes)
npx tsc --noEmit
npm run lint
npm test

# Manual verification:
# 1. Run the migration script against the live DB
# 2. Check that admin@demo.local can still log in (role migrated to PLATFORM_ADMIN)
# 3. Check that the admin page header shows the DB-configured title (not "iSN")
# 4. Verify: SELECT role FROM dashboard.users; -- should show PLATFORM_ADMIN/TENANT_USER
```

## 6. Definition of done

- [ ] Companies table exists in schema SQL.
- [ ] Migration script is idempotent and handles existing data.
- [ ] Role enum has three values; `resolve_role()` handles legacy strings.
- [ ] AuthClaims includes `company_id`.
- [ ] JWT creation includes `company_id`; decoding uses `resolve_role()`.
- [ ] Tenancy checks support all three roles.
- [ ] Repository has Company CRUD + `list_tenants_for_company()`.
- [ ] Protocol and InMemoryRepository updated.
- [ ] Admin page shows DB-configured site title.
- [ ] All verification gates green.
- [ ] No git operations performed.
