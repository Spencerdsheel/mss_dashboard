# Sprint 03–07 Context — Cold-Start Briefing for Qwen

> **Purpose.** If you are Qwen starting a sprint (03 through 07), read this file PLUS the
> sprint spec PLUS `qwen_implementation_guide.md` PLUS `CLAUDE.md`. This gives you the context
> that Opus (planner) had when writing the specs, so you can make informed decisions on anything
> the spec doesn't cover explicitly.

---

## 0. What these sprints are about

The user wants to evolve the iSN Dashboard from a prototype/demo state into a production-ready
platform. These sprints cover:

- **Sprint 03:** Remove all demo/prototype branding from the login page
- **Sprint 04:** Fix home page (section labels, badge text, date filter, dynamic header title)
- **Sprint 05:** Fix admin bugs (project update losing visit_count, client_name confusion, empty metrics)
- **Sprint 06:** Fix project page visuals (KPI card heights, pie chart layout, data empty states)
- **Sprint 07:** Introduce three-tier role system (PLATFORM_ADMIN / CLIENT_ADMIN / TENANT_USER)

Sprints 03-06 are independent quick fixes. Sprint 07 is a major architectural change.

---

## 1. Codebase layout (refresher)

```
mss_dashboard/mss_dashboard/
├── src/                              # Next.js 15 frontend
│   ├── app/
│   │   ├── login/                    # Login page (Sprint 03)
│   │   │   ├── page.tsx              # Server component, branding text
│   │   │   ├── login-form.tsx        # Client component, form inputs
│   │   │   └── actions.ts            # Server action for login
│   │   ├── dashboard/
│   │   │   ├── page.tsx              # Home page with project grid (Sprint 04)
│   │   │   ├── layout.tsx            # Dashboard layout wrapper
│   │   │   └── projects/[projectId]/
│   │   │       ├── page.tsx          # Project detail KPI cards (Sprint 06)
│   │   │       └── charts-section.tsx # All charts (Sprint 05, 06)
│   │   └── admin/
│   │       ├── projects/             # Project management (Sprint 05)
│   │       ├── connections/          # Provider connections (Sprint 05)
│   │       ├── metrics/              # Metric targets
│   │       └── settings/             # NEW in Sprint 04 (platform settings)
│   ├── components/
│   │   ├── app-shell.tsx             # Top nav with "iSN" title (Sprint 04)
│   │   └── charts/                   # Recharts components
│   ├── server/
│   │   ├── admin-api.ts              # TypeScript client for admin endpoints
│   │   ├── analytics.ts              # getProjectSummary()
│   │   ├── backend-api.ts            # HTTP helpers (backendGet/Post/Patch)
│   │   └── rbac.ts                   # requireSession, requireAdmin, assertProjectAccess
│   └── lib/
│       ├── constants.ts              # Demo credentials (DO NOT DELETE — used by tests)
│       ├── chart-helpers.ts          # buildTrendData(), installGridClass() (Sprint 06)
│       ├── projects.ts               # isProjectActive()
│       └── utils.ts                  # formatDate, cn, formatPct
│
├── services/                          # Python FastAPI backend
│   ├── api/
│   │   ├── routes/
│   │   │   ├── admin.py              # Admin endpoints (Sprint 05, 07)
│   │   │   ├── auth.py               # Login/logout/password-reset
│   │   │   └── projects.py           # Project data endpoints
│   │   ├── dependencies.py           # DI: get_current_claims, get_repository
│   │   └── exceptions.py             # AuthorizationError, NotFoundError, etc.
│   ├── common/
│   │   ├── models.py                 # Role enum, AuthClaims, Project, Tenant, etc.
│   │   ├── postgres_repository.py    # All DB queries (Sprint 05, 07)
│   │   ├── repository.py             # Protocol interface + in-memory impl
│   │   ├── security.py               # JWT creation/verification, password hashing
│   │   └── tenancy.py                # can_access_project(), require_admin()
│   └── ingestion/
│       ├── dashboard_schema.sql      # DB schema (Sprint 04, 07)
│       └── ...                       # Extractor, transform, persistence (not touched)
│
├── tests/                             # Vitest frontend tests (DO NOT EDIT)
├── backend_tests/                     # pytest backend tests
└── CLAUDE.md                          # RED LINES — always read
```

---

## 2. Key patterns you must follow

### Frontend patterns

- **Server Components** (no `"use client"`) fetch data and pass to Client Components.
- **Client Components** (`"use client"`) handle interactivity, local state, transitions.
- **Server Actions** (`"use server"` in `actions.ts`) call `backendGet/Post/Patch` with the auth
  token from cookies.
- **Styling:** Tailwind CSS with the Ventriloc palette (see `.claude/skills/ui-design-system/`).
  Key colors: `text-carbon` (foreground), `text-slate` (secondary), `bg-chalk` (borders),
  `bg-signal-orange` (accent), `bg-fog` (card backgrounds). Typography: `font-space-grotesk` for
  headings/numbers, Inter for body.
- **UI components:** shadcn/ui in `src/components/ui/`. Use these, don't invent new ones.

### Backend patterns

- **Thin REST handlers:** Parse request → call repository → shape response. No business logic.
- **Repository pattern:** `DashboardRepository` Protocol with Postgres implementation. All queries
  are parameterized (`$1, $2...`), never string-interpolated.
- **Tenant isolation:** Every query WHERE clause includes `tenant_id` from JWT claims.
- **Admin gating:** `require_admin_claims` dependency checks `claims.role == Role.ADMIN`.
- **No ORM:** Raw SQL via asyncpg. Follow existing query patterns in `postgres_repository.py`.

### How admin pages work (pattern to follow)

Each admin page has 3 files:

1. **`page.tsx`** (server component): Reads token from cookies, fetches data via `admin-api.ts`
   helpers, passes data to client component.
2. **`*-client.tsx`** (client component): Renders UI with local state, calls server actions on
   submit.
3. **`actions.ts`** (server actions): Reads token from cookies, calls `admin-api.ts` helpers,
   returns result.

Example: `src/app/admin/projects/{page.tsx, projects-client.tsx, actions.ts}`.

---

## 3. Confirmed bugs and their root causes

### Bug: Project update loses visit_count (Sprint 05)

**Where:** `services/common/postgres_repository.py`, method `update_project()` (~line 918)

**Root cause:** The `RETURNING` clause lists `tenant_id, project_id, name, slug, client_name,
provider_kind, start_date, end_date` — but NOT `visit_count`. The `project_from_row()` function
reads `visit_count` from the row dict, gets `None`, defaults to 0.

**Effect:** After editing a project in admin, the frontend receives `visit_count: 0`, updates
local state, and the project card shows 0 visits until page reload.

**Fix:** Use a CTE to compute visit_count in the same query (see sprint-05 spec for exact SQL).

### Not-a-bug: Connection display_name vs project client_name

**Where:** `provider_connections.display_name` vs `projects.client_name`

**What happened:** User changed `display_name` to "Canada Client" on the Connections admin page,
but dashboard project cards still show the old name. That's because cards read
`projects.client_name` — a completely different DB field.

**Fix:** Add `client_name` editing to the Projects admin page (Sprint 05).

### Not-a-bug: Total Visits = Unique Stores (both 436)

**Why:** Sample data has every visit going to a unique store. The query
`COUNT(DISTINCT store_id)` correctly returns 436. Real data with repeat store visits will differ.

### Not-a-bug: P3 empty in Photo Coverage

**Why:** The project being viewed has no PHOTO_3 data. The bar chart correctly shows a zero bar.

---

## 4. Current roles and how they'll change (Sprint 07)

### Current (2 roles)

```python
class Role(str, Enum):
    ADMIN = "ADMIN"      # Sees everything, manages all tenants/users
    CLIENT = "CLIENT"    # Sees only their tenant's assigned projects
```

JWT claims: `{sub, email, role, tenant_id, project_ids, jti, iat, exp}`

### Target (3 roles)

```python
class Role(str, Enum):
    PLATFORM_ADMIN = "PLATFORM_ADMIN"  # iSN team, global scope
    CLIENT_ADMIN = "CLIENT_ADMIN"      # Company-scoped (e.g. mystery shopping company)
    TENANT_USER = "TENANT_USER"        # Tenant + project-scoped
```

JWT claims: `{sub, email, role, tenant_id, company_id, project_ids, jti, iat, exp}`

New concept: **Company** groups tenants. A CLIENT_ADMIN sees all tenants in their company.

### Migration mapping
- Existing `ADMIN` → `PLATFORM_ADMIN`
- Existing `CLIENT` → `TENANT_USER`
- No existing `CLIENT_ADMIN` users (created later)

---

## 5. Database schema (relevant tables)

```sql
-- Core
dashboard.tenants(tenant_id PK, name, slug UNIQUE, country, status)
dashboard.projects(tenant_id, project_id PK, name, slug, client_name, start_date, end_date, ...)
dashboard.users(user_id PK, email UNIQUE, name, role, tenant_id FK, hashed_password, status)
dashboard.visits(tenant_id, project_id, survey_id PK, store_id, visit_date, install1..4, ...)
dashboard.visit_photos(tenant_id, project_id, survey_id, kind, url PK, caption)

-- Config
dashboard.project_metrics(tenant_id, project_id, key PK, label, value, unit, category)
dashboard.provider_connections(tenant_id, kind PK, status, display_name, base_url, client_id, client_secret_encrypted)
dashboard.platform_settings(key PK, value, updated_at)  -- NEW in Sprint 04

-- Sprint 07
dashboard.companies(company_id PK, name, slug UNIQUE, status)  -- NEW
-- + company_id FK on tenants and users
```

---

## 6. API endpoint reference (what exists)

```
POST   /auth/login
POST   /auth/logout
GET    /auth/me

GET    /projects
GET    /projects/{id}/summary
GET    /projects/{id}/visits
GET    /projects/{id}/visits/{instance_id}
GET    /projects/{id}/visits/{instance_id}/photos

GET    /admin/tenants
POST   /admin/tenants
PATCH  /admin/tenants/{tenant_id}
GET    /admin/tenants/{tenant_id}/projects
PATCH  /admin/tenants/{tenant_id}/projects/{project_id}
GET    /admin/tenants/{tenant_id}/shopmetrics-connection
PATCH  /admin/tenants/{tenant_id}/shopmetrics-connection
POST   /admin/tenants/{tenant_id}/refresh
GET    /admin/tenants/{tenant_id}/scheduled-refresh
POST   /admin/tenants/{tenant_id}/scheduled-refresh
GET    /admin/tasks/{task_id}
GET    /admin/runs
GET    /admin/users
POST   /admin/users
PATCH  /admin/users/{user_id}
POST   /admin/users/{user_id}/password-reset
GET    /admin/projects/{project_id}/photo-slots
PATCH  /admin/projects/{project_id}/photo-slots
GET    /admin/projects/{project_id}/metrics
PATCH  /admin/projects/{project_id}/metrics

# NEW in Sprint 04:
GET    /admin/settings/{key}
PATCH  /admin/settings/{key}
# Also need a public endpoint for non-admin users:
GET    /settings/public/{key}  (whitelisted keys only, no auth required)

# NEW in Sprint 07:
GET    /admin/companies
POST   /admin/companies
PATCH  /admin/companies/{company_id}
```

---

## 7. Frontend type reference (`src/server/admin-api.ts`)

```ts
type AdminTenant = { id, name, slug, country, status, locale }
type AdminUser = { id, email, name, role, tenant_id, project_ids, status }
type AdminProject = { id, name, tenant_id, slug, start_date, end_date, visit_count, client_name }
type ProviderConnection = { tenant_id, kind, status, display_name, base_url, client_id, has_client_secret, last_sync_at }
type ProjectMetric = { key, label, value, unit, category }
```

---

## 8. What NOT to touch

- **`src/lib/constants.ts`** — Demo credentials used by tests. Remove imports, never the file.
- **`tests/*.test.ts`** — Tests define contracts. Make code pass them; never edit tests.
- **`services/ingestion/client.py`, `extractor.py`, `transform.py`** — Ingestion pipeline is out
  of scope for sprints 03-06. Sprint 07 doesn't touch ingestion either.
- **`.claude/rules/*.md`** — Canonical rules. Never modify.
- **Git operations** — Never `git add/commit/push`. Leave the working tree dirty.

---

## 9. Sprint execution order

Run sprints sequentially. Each must pass verification gates before starting the next.

1. **Sprint 03** (login cleanup) — pure frontend, no dependencies
2. **Sprint 04** (home page) — frontend + small backend (platform_settings table)
3. **Sprint 05** (admin bugs) — backend SQL fix + frontend form additions
4. **Sprint 06** (project visuals) — pure frontend, depends on sprint-05 empty metrics fix
5. **Sprint 07** (three-tier roles) — major backend + frontend, do last

For each sprint, read the spec at `.claude/specs/sprint-NN-*.md`.
