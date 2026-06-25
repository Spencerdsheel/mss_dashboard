# Sprint 07 — Three-tier role system (PLATFORM_ADMIN / CLIENT_ADMIN / TENANT_USER)

> **Author:** Opus (planner). **Implementer:** Qwen 3.5 via opencode. **Verifier:** Sonnet.
> Read `qwen_implementation_guide.md` + `CLAUDE.md` first. Do **not** git-commit — the user does.
>
> **NOTE:** This is a large architectural change. Implementation should be done incrementally —
> first the DB migration, then backend models, then API changes, then frontend. Each layer should
> be verified before moving to the next.

## 1. Goal

The current system has two roles: ADMIN (sees everything) and CLIENT (tenant-scoped). The new
system introduces a three-tier hierarchy:

| Role | Who | Scope | JWT claims |
|------|-----|-------|------------|
| `PLATFORM_ADMIN` | iSN team | All companies, all tenants, all projects | `role`, no scope restriction |
| `CLIENT_ADMIN` | Mystery shopping company | All tenants under their company | `role`, `company_id` |
| `TENANT_USER` | Brasserie Labatt (tenant) | Only assigned projects in their tenant | `role`, `tenant_id`, `project_ids` |

After this sprint: the database supports companies, all three roles work end-to-end, tenant
isolation is preserved, and existing ADMIN/CLIENT users are migrated.

## 2. Scope

### Database (schema changes)

**New table:**
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

**Alter existing tables:**
```sql
-- Tenants belong to a company
ALTER TABLE dashboard.tenants
    ADD COLUMN IF NOT EXISTS company_id TEXT REFERENCES dashboard.companies(company_id);

-- Users can belong to a company (CLIENT_ADMIN) or be global (PLATFORM_ADMIN)
ALTER TABLE dashboard.users
    ADD COLUMN IF NOT EXISTS company_id TEXT REFERENCES dashboard.companies(company_id);
```

**Migration script** (create as `services/ingestion/migrations/001_add_companies.sql`):
```sql
-- 1. Create companies table
CREATE TABLE IF NOT EXISTS dashboard.companies (...);

-- 2. Add company_id to tenants and users
ALTER TABLE dashboard.tenants ADD COLUMN IF NOT EXISTS company_id TEXT ...;
ALTER TABLE dashboard.users ADD COLUMN IF NOT EXISTS company_id TEXT ...;

-- 3. Create a default company for existing tenants
INSERT INTO dashboard.companies (company_id, name, slug)
VALUES ('company_default', 'Default Company', 'default')
ON CONFLICT DO NOTHING;

-- 4. Assign existing tenants to default company
UPDATE dashboard.tenants SET company_id = 'company_default' WHERE company_id IS NULL;

-- 5. Map existing users:
--    - ADMIN → PLATFORM_ADMIN (role stays ADMIN for backward compat, or update enum)
--    - CLIENT → TENANT_USER
-- Note: Role enum update should be handled carefully (see §3)
```

### Backend models (`services/common/`)

**`models.py`:**
```python
class Role(str, Enum):
    PLATFORM_ADMIN = "PLATFORM_ADMIN"
    CLIENT_ADMIN = "CLIENT_ADMIN"
    TENANT_USER = "TENANT_USER"
    # Backward compatibility aliases (used during migration)
    ADMIN = "PLATFORM_ADMIN"
    CLIENT = "TENANT_USER"
```

Wait — the `ADMIN = "PLATFORM_ADMIN"` alias pattern won't work cleanly in Python enums.
Instead, handle backward compatibility at the JWT decoding layer:

```python
class Role(str, Enum):
    PLATFORM_ADMIN = "PLATFORM_ADMIN"
    CLIENT_ADMIN = "CLIENT_ADMIN"
    TENANT_USER = "TENANT_USER"

# Backward compat mapping for existing JWT tokens
_ROLE_MIGRATION = {
    "ADMIN": Role.PLATFORM_ADMIN,
    "CLIENT": Role.TENANT_USER,
}

def resolve_role(raw: str) -> Role:
    try:
        return Role(raw)
    except ValueError:
        migrated = _ROLE_MIGRATION.get(raw)
        if migrated:
            return migrated
        raise
```

**`AuthClaims`:**
```python
@dataclass(frozen=True)
class AuthClaims:
    user_id: str
    role: Role
    tenant_id: str | None
    company_id: str | None = None    # NEW
    project_ids: tuple[str, ...] = field(default_factory=tuple)
    email: str | None = None
```

**New dataclass:**
```python
@dataclass(frozen=True)
class Company:
    id: str
    name: str
    slug: str
    status: str = "active"
```

### Security / JWT (`services/common/security.py`)

Update `create_access_token()` to include `company_id` in claims.
Update `decode_access_token()` to read `company_id` and use `resolve_role()`.

### Tenancy (`services/common/tenancy.py`)

Extend the access check functions:

```python
def can_access_project(claims: AuthClaims, project: Project) -> bool:
    if project is None:
        return False
    if claims.role == Role.PLATFORM_ADMIN:
        return True
    if claims.role == Role.CLIENT_ADMIN:
        # CLIENT_ADMIN can see all tenants under their company
        # Need to check: project.tenant_id belongs to a tenant with claims.company_id
        # This requires a company→tenant lookup (passed in or queried)
        return True  # Simplified — actual impl needs company check
    if claims.role == Role.TENANT_USER:
        if claims.tenant_id is None:
            return False
        if project.tenant_id != claims.tenant_id:
            return False
        return project.id in claims.project_ids
    return False

def require_admin(claims: AuthClaims):
    """Requires PLATFORM_ADMIN role."""
    if claims.role != Role.PLATFORM_ADMIN:
        raise AuthorizationError("Platform admin role required")

def require_client_admin_or_above(claims: AuthClaims):
    """Requires CLIENT_ADMIN or PLATFORM_ADMIN."""
    if claims.role not in (Role.PLATFORM_ADMIN, Role.CLIENT_ADMIN):
        raise AuthorizationError("Client admin or higher role required")
```

### Repository (`services/common/postgres_repository.py`)

Add company-scoped queries:

```python
# Companies CRUD
async def list_companies(self) -> list[Company]: ...
async def create_company(self, name, slug) -> Company: ...
async def update_company(self, company_id, name, slug) -> Company: ...

# Tenant listing now respects company scope
async def list_tenants(self, claims: AuthClaims) -> list[Tenant]:
    if claims.role == Role.PLATFORM_ADMIN:
        return await self._list_all_tenants()
    elif claims.role == Role.CLIENT_ADMIN:
        return await self._list_tenants_for_company(claims.company_id)
    else:
        # TENANT_USER sees only their own tenant
        return await self._list_tenant_by_id(claims.tenant_id)

# Projects listing
async def list_projects(self, claims: AuthClaims) -> list[Project]:
    if claims.role == Role.PLATFORM_ADMIN:
        # All projects across all tenants
        ...
    elif claims.role == Role.CLIENT_ADMIN:
        # All projects for tenants under their company
        ...
    elif claims.role == Role.TENANT_USER:
        # Only their tenant + assigned project_ids
        ...
```

### API routes (`services/api/routes/admin.py`)

**Role gating changes:**
- `GET /admin/tenants` — PLATFORM_ADMIN sees all; CLIENT_ADMIN sees their company's tenants
- `POST /admin/tenants` — PLATFORM_ADMIN only
- `GET /admin/users` — PLATFORM_ADMIN sees all; CLIENT_ADMIN sees users in their company
- `POST /admin/users` — PLATFORM_ADMIN + CLIENT_ADMIN (CLIENT_ADMIN can only create TENANT_USER
  within their company's tenants)

**New endpoints:**
- `GET /admin/companies` — PLATFORM_ADMIN only
- `POST /admin/companies` — PLATFORM_ADMIN only
- `PATCH /admin/companies/{company_id}` — PLATFORM_ADMIN only

### Frontend RBAC (`src/server/rbac.ts`)

Update role checks:
```ts
export type UserRole = "PLATFORM_ADMIN" | "CLIENT_ADMIN" | "TENANT_USER";

export function isPlatformAdmin(session: Session): boolean {
  return session.user.role === "PLATFORM_ADMIN";
}

export function isClientAdminOrAbove(session: Session): boolean {
  return ["PLATFORM_ADMIN", "CLIENT_ADMIN"].includes(session.user.role);
}
```

### Frontend navigation (`src/components/app-shell.tsx`)

Adjust nav items based on role:
- PLATFORM_ADMIN sees: Home, Admin (full), Companies
- CLIENT_ADMIN sees: Home, Admin (scoped to their company), no Companies
- TENANT_USER sees: Home, Project Overview, Visit List (no Admin)

### Admin pages

- New `src/app/admin/companies/` page — PLATFORM_ADMIN only
- Existing admin pages filter data by role scope

## 3. Data migration strategy

1. Create the `companies` table and columns first
2. Create a default company, assign existing tenants
3. Update existing user roles: `ADMIN` → `PLATFORM_ADMIN`, `CLIENT` → `TENANT_USER`
4. New JWT tokens will use the new role names
5. Old JWT tokens (with `ADMIN`/`CLIENT`) are handled by `resolve_role()` backward compat

## 4. Red lines

- **Tenant isolation (CLAUDE.md §5.1):** ABSOLUTELY CRITICAL. `tenant_id` still comes only from
  JWT claims. `company_id` also comes only from JWT claims. CLIENT_ADMIN can see tenants within
  their company, but NEVER tenants from other companies. TENANT_USER scope is unchanged.
- **No silent fallbacks (CLAUDE.md §5.2):** If a role check fails, return 403 explicitly.
- **Token storage (CLAUDE.md §5.3):** JWT still in httpOnly cookies. New `company_id` claim is
  just an additional field.

## 5. Verification gates

```bash
# backend
conda activate venv
python -m pytest backend_tests -v

# frontend
npx tsc --noEmit
npm run lint
npm test

# RBAC verification (manual)
# 1. PLATFORM_ADMIN can see all companies, all tenants, all projects
# 2. CLIENT_ADMIN can see only tenants in their company
# 3. CLIENT_ADMIN CANNOT see other company's tenants (403)
# 4. TENANT_USER can see only their assigned projects (unchanged behavior)
# 5. Old ADMIN/CLIENT JWT tokens still work via resolve_role()
```

## 6. Definition of done

- [ ] Companies table exists with default company seeded.
- [ ] All three roles work end-to-end (login → dashboard → correct data scope).
- [ ] Existing ADMIN/CLIENT users are migrated and can still log in.
- [ ] Tenant isolation is preserved — cross-company access returns 403.
- [ ] All verification gates green.
- [ ] No git operations performed.
