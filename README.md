# iSN Dashboard

**A multi-tenant retail-execution analytics platform that turns raw field-visit data into real-time KPIs, install-compliance rates, and photo evidence for retail campaign clients.**

---

## Table of Contents

1. [Why This Exists](#why-this-exists)
2. [Architecture](#architecture)
3. [How It Solves the Problem](#how-it-solves-the-problem)
4. [Security & Data Integrity](#security--data-integrity)
5. [Getting Started](#getting-started)
6. [Testing](#testing)
7. [Current Status](#current-status)
8. [Project Structure](#project-structure)
9. [License](#license)

---

## Why This Exists

Retail-execution campaigns (in-store displays, standees, product installs) are audited by field
reps who log visits, answer install-compliance questions, and upload photo evidence through a
provider such as **Shopmetrics** (rebranding to **iSN**). That raw data is valuable, but on its
own it is just rows in a third-party system — a brand team asking "did our display go up in 90%
of stores this month?" has no self-serve way to answer it.

The iSN Dashboard exists to close that gap:

- **No manual reporting.** Instead of exporting spreadsheets from the provider and building
  pivot tables by hand, clients get a live dashboard of visits, install-execution rates, and
  photo evidence per project.
- **No cross-tenant leakage.** Multiple retail clients (e.g. Brasserie Labatt) share the
  platform, so every query, token, and cached value is scoped to a tenant — one client can never
  see another's data.
- **No stale or fabricated numbers.** If the data pipeline or auth layer fails, the dashboard
  fails *visibly* (redirect to login, explicit error) instead of silently showing placeholder or
  sample data as if it were real.
- **Self-serve, role-appropriate access.** Platform operators, client administrators, and
  field/brand users each see the slice of data appropriate to their role, without needing an
  analyst to run a report for them.

## Architecture

### Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router, React 19, React Server Components), TypeScript, shadcn/ui, Tailwind CSS |
| Backend | Python, FastAPI (REST), Celery (async/scheduled tasks) |
| Database | PostgreSQL 16 — multi-tenant, schema `dashboard.*` |
| Cache / broker | Redis 7 — response cache, rate limiting, Celery broker, JWT revocation |
| Charts | Recharts, custom SVG components |
| Auth | JWT in httpOnly cookies, PBKDF2-SHA256 password hashing |

### Request-time data flow

Every dashboard read follows one path, from browser to database and back:

```
Browser (dashboard page, React Server Component)
   │
   ▼
src/server/analytics.ts   getProjectSummary()
   │  (server-side fetch, JWT cookie forwarded)
   ▼
GET /projects/{id}/summary          services/api/routes/*  (FastAPI)
   │  (thin handler: authz → repository call → response shape)
   ▼
services/common/postgres_repository.py   get_project_summary()
   │  (tenant-scoped SQL — tenant_id always from verified JWT claims)
   ▼
PostgreSQL   dashboard.* schema
```

### Ingestion pipeline (separate path)

Field data does not reach Postgres through the request path above — it is pulled and normalized
on a schedule:

```
Shopmetrics / iSN provider API
   │  OAuth2 client_credentials
   ▼
services/ingestion/client.py + extractor.py     (pulls 12 resources: 7 reference, 5 transactional)
   │
   ▼
services/ingestion/transform.py                 normalizes rowsets → visits, photos, install answers
   │
   ▼
services/ingestion/persistence.py                load_transformed_dataset()  (idempotent upsert)
   │
   ▼
PostgreSQL   dashboard.*
```

Scheduling and orchestration run through Celery (`celery_app.py`, `tasks.py`):

- **On-demand:** an admin action dispatches a Celery task via `POST /admin/tenants/{id}/refresh`.
- **Scheduled:** Celery Beat triggers a refresh for all tenants on a configurable interval.
- **Idempotent by design:** re-running ingestion for the same tenant/project must not duplicate
  or mint new rows — this is enforced at the persistence layer, not left to chance.

The backend also supports two interchangeable repository implementations behind a `Repository`
Protocol — an in-memory store (development) and an `asyncpg`-backed Postgres implementation
(production) — selected via configuration, not scattered `if` branches.

## How It Solves the Problem

Concretely, the platform gives clients:

- **A live project dashboard** (`src/app/dashboard/`) — KPIs, install-execution donut charts,
  visit counts, and date-range summaries per project, rendered server-side.
- **Visit-level drill-down** — a filterable/sortable visit list with photo evidence per store
  visit (`src/app/dashboard/projects/[projectId]/visits/`).
- **Role-appropriate admin tooling** (`src/app/admin/`) — tenant/company management, user
  management, provider connection configuration, scheduled-refresh control, run-history/audit
  logs, and photo-slot labeling, gated by role.
- **Multi-tenant isolation as a platform guarantee**, not an application-level convention — every
  repository method takes explicit tenant context and every JWT carries `tenant_id`, `role`, and
  `project_ids`, so a client's view is structurally bounded to their own data.
- **Three-tier role model** (`services/common/models.py`): `PLATFORM_ADMIN` (cross-tenant
  operations), `CLIENT_ADMIN` (manages their tenant's users/projects), and `TENANT_USER`
  (project-scoped read access) — replacing a coarser two-role model as the product matures.

## Security & Data Integrity

These are treated as non-negotiable platform guarantees, not aspirational goals:

| Guarantee | Implementation |
|---|---|
| **Tenant isolation** | `tenant_id` is derived only from verified JWT claims — never from query strings, request bodies, route params, or headers. Every database-layer function takes explicit tenant context. |
| **No silent fallbacks** | On an API or auth error, the app fails explicitly (redirect to login, surfaced error). Sample/demo data is never silently substituted for real data. |
| **Token storage** | JWTs live in httpOnly cookies — never `localStorage` or client-readable storage. |
| **Password hashing** | PBKDF2-SHA256 with 120,000 iterations. |
| **Secret encryption** | Provider secrets (e.g. Shopmetrics credentials) are encrypted at rest with AES-256-GCM via a dedicated `SECRET_ENCRYPTION_KEY`, distinct from `JWT_SECRET`. |
| **Thin REST handlers** | `services/api/routes/*` never import Shopmetrics/ingestion HTTP client code directly — ingestion is a separate service, invoked via Celery, not inline in a request handler. |
| **Idempotent ingestion** | Re-running ingestion for a tenant/project cannot duplicate or fabricate rows. |
| **Rate limiting** | Redis-backed, with an in-memory fallback; fails closed on auth/admin routes. |

## Getting Started

### Prerequisites

- Node.js (for Next.js 15 / React 19)
- A conda environment named `venv` for all Python tooling (`python`, `pip`, `pytest`, `uvicorn`,
  `celery` all run inside it — `conda activate venv` first)
- Docker (for local Postgres + Redis)

### 1. Start Postgres + Redis

```bash
docker compose up -d
```

This starts PostgreSQL on `5433` and Redis on `6380` for local development.

### 2. Install dependencies

```bash
# Frontend
npm install --legacy-peer-deps

# Backend
conda activate venv
pip install -r requirements-backend.txt
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env as needed — REDIS_URL already points to redis://localhost:6380/0
```

### 4. Run the backend

```bash
conda activate venv
uvicorn services.api.main:app --reload --port 8010
```

### 5. Run the frontend

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Local ports

| Service | Port |
|---|---|
| PostgreSQL | 5433 |
| Redis | 6380 |
| API (uvicorn) | 8010 |
| Frontend (Next.js) | 3000 |

## Testing

Run these gates before considering any change complete:

```bash
# Frontend
npx tsc --noEmit
npm run lint
npm test                 # Vitest — includes tests/seed-parity.test.ts, rbac.test.ts,
                          # cascading-filters.test.ts, chart-helpers.test.ts, provider-contract.test.ts

# Backend
conda activate venv
python -m pytest backend_tests -v
```

`tests/seed-parity.test.ts` locks the deterministic sample-data generator to a fixed contract
(a specific visit count, date range, and install-answer distribution) used as an acceptance
baseline for development and testing — it is a test fixture, not a production metric.

## Current Status

This is an actively developed platform, not a finished product. The core request path (auth →
dashboard → project summary → visit list/photos), the ingestion pipeline, and the security
guardrails described above are implemented and exercised by the test suites in `tests/` and
`backend_tests/`. Product features continue to land in phases — see `implementation.md` and
`updates/phase.md` for the current roadmap, and `.claude/specs/` for in-flight and completed
sprint specifications. Expect ongoing changes to the role model, admin surface, and chart set as
the platform matures.

## Project Structure

```
├── src/                              # Next.js frontend
│   ├── app/
│   │   ├── login/                    # Authentication
│   │   ├── reset-password/           # Password reset flow
│   │   ├── dashboard/                # Client-facing project dashboards, visits, photos
│   │   └── admin/                    # Companies, connections, users, projects, runs, settings, metrics
│   ├── components/                   # UI components (charts, admin, shadcn/ui primitives)
│   ├── lib/                          # Constants, chart helpers, cascading filters, geo data, utils
│   ├── server/                       # Server-side data fetchers / API clients
│   ├── types/                        # Shared TypeScript types
│   └── middleware.ts                 # Auth/session middleware
│
├── services/                         # Python backend
│   ├── api/                          # FastAPI REST service
│   │   ├── routes/                   # API endpoints (thin handlers)
│   │   ├── middleware.py             # CORS, correlation ID
│   │   ├── rate_limiter.py           # Redis/in-memory rate limiting
│   │   └── error_handler.py          # Centralized, secret-free error responses
│   ├── common/                       # Shared domain layer
│   │   ├── models.py                 # Domain models, Role enum
│   │   ├── repository.py             # Repository Protocol (contract)
│   │   ├── postgres_repository.py    # Tenant-scoped Postgres implementation
│   │   ├── security.py               # JWT issuance/verification, password hashing
│   │   ├── secrets.py                # AES-256-GCM secret encryption
│   │   └── tenancy.py                # Multi-tenant isolation helpers
│   └── ingestion/                    # Data ingestion pipeline
│       ├── client.py / extractor.py  # Shopmetrics OAuth2 client + resource pulls
│       ├── transform.py              # Rowset → normalized dataset
│       ├── persistence.py            # Idempotent Postgres loader
│       ├── celery_app.py / tasks.py  # Scheduling and async refresh
│       └── dashboard_schema.sql      # Postgres schema
│
├── tests/                            # Frontend tests (Vitest) — parity, RBAC, filters, charts
├── backend_tests/                    # Backend tests (pytest) — tenancy, security, transform, pagination
├── knowledge_base/                   # Deep architecture references (system design, security, RBAC, infra)
└── .claude/                          # Rules, specs, and skills for AI-assisted development on this repo
```

## License

Private — iSN / Shopmetrics Platform.
