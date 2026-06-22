# iSN Dashboard Platform 

Production-ready, multi-tenant retail execution dashboard platform.

## Architecture

- **Frontend:** Next.js 15 (App Router) · TypeScript · shadcn/ui · Tailwind
- **Backend:** Python FastAPI REST API
- **Database:** PostgreSQL 16 (multi-tenant)
- **Cache:** Redis (rate limiting, session storage)
- **Auth:** JWT with httpOnly cookies · PBKDF2-SHA256 password hashing
- **Task Queue:** Celery (Redis broker) — Scheduled and on-demand data refreshes
- **Monitoring:** Prometheus metrics · Structured JSON logging

## Quick Start

### 1. Start PostgreSQL + Redis

```bash
docker compose up -d
```

This starts both PostgreSQL (port 5433) and Redis (port 6379) for local development.

### 2. Install Dependencies

**Frontend:**
```bash
npm install --legacy-peer-deps
```

**Backend:**
```bash
pip install -r requirements-backend.txt
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env if needed (REDIS_URL is already set to redis://localhost:6379/0)
```

### 4. Start Backend

```bash
uvicorn services.api.main:app --reload --port 8010
```

### 5. Start Frontend

```bash
npm run dev
```

Open http://localhost:3000 and log in with:

| Email | Password | Role |
| --- | --- | --- |
| `admin@demo.local` | `Demo123!` | Admin — sees all tenants/projects |
| `client-test1@demo.local` | `Demo123!` | Client — sees assigned projects only |

## Project Structure

```
├── src/                          # Next.js frontend
│   ├── app/                      # App Router pages
│   │   ├── login/                # Authentication
│   │   ├── dashboard/            # User dashboard
│   │   └── admin/                # Admin panel
│   ├── components/               # UI components
│   └── server/                   # Server actions & API clients
│
├── services/                     # Python backend
│   ├── api/                      # FastAPI REST service
│   │   ├── routes/               # API endpoints
│   │   ├── middleware.py         # CORS, correlation ID
│   │   ├── rate_limiter.py       # Redis/in-memory rate limiting
│   │   ├── metrics.py            # Prometheus metrics
│   │   └── error_handler.py      # Centralized error handling
│   ├── common/                   # Shared utilities
│   │   ├── models.py             # Domain models
│   │   ├── repository.py         # Repository contracts
│   │   ├── postgres_repository.py # PostgreSQL implementation
│   │   ├── security.py           # JWT, password hashing
│   │   ├── secrets.py            # AES-256 encryption
│   │   ├── settings.py           # Configuration
│   │   └── tenancy.py            # Multi-tenant isolation
│   └── ingestion/                # Data ingestion pipeline
│       ├── celery_app.py         # Celery app + beat schedule
│       ├── tasks.py              # Celery tasks (tenant refresh, scheduled)
│       ├── refresh.py            # Manual refresh entrypoint
│       ├── client.py             # ShopmetricsClient + OAuth
│       ├── extractor.py          # Resource pull orchestration
│       ├── resources.py          # 12 Shopmetrics resource definitions
│       ├── transform.py          # Rowset → normalized dataset
│       ├── transform_local_dummy_db.py  # Persist to Postgres
│       ├── local_fixtures.py     # Excel workbook loader
│       ├── local_dummy_schema.sql
│       └── dashboard_schema.sql
│
├── backend_tests/                # Python backend tests
├── scripts/                      # Utility scripts
├── documentation/                # Project documentation
└── .claude/                      # AI agent configuration
```

## API Endpoints

### Authentication
- `POST /auth/login` — Login with email/password
- `POST /auth/logout` — Logout
- `GET /auth/me` — Get current user

### Dashboard
- `GET /projects` — List accessible projects
- `GET /projects/{project_id}/summary` — Project summary with KPIs
- `GET /projects/{project_id}/visits` — List visits
- `GET /projects/{project_id}/visits/{instance_id}` — Visit details
- `GET /projects/{project_id}/visits/{instance_id}/photos` — Visit photos

### Admin (requires ADMIN role)
- `GET /admin/tenants` — List tenants
- `POST /admin/tenants` — Create tenant
- `PATCH /admin/tenants/{id}` — Update tenant
- `PATCH /admin/tenants/{id}/shopmetrics-connection` — Set provider connection
- `POST /admin/tenants/{id}/refresh` — Trigger Celery refresh
- `GET /admin/tenants/{id}/scheduled-refresh` — Get scheduled refresh status
- `POST /admin/tenants/{id}/scheduled-refresh` — Toggle scheduled refresh
- `GET /admin/tasks/{task_id}` — Check Celery task status
- `GET /admin/runs` — List run logs
- `GET /admin/users` — List users
- `POST /admin/users` — Create user
- `PATCH /admin/users/{id}` — Update user
- `GET /admin/projects/{project_id}/photo-slots` — Photo slot labels
- `PATCH /admin/projects/{project_id}/photo-slots` — Update photo slots

### Mock Shopmetrics API (local dev only)
- `POST /fake-shopmetrics/oauth/connect/token` — Mock OAuth token
- `POST /fake-shopmetrics/api/v2/execute` — Mock query API

### Health & Monitoring
- `GET /healthz` — Liveness check
- `GET /readyz` — Readiness check (database connectivity)
- `GET /metrics` — Prometheus metrics

## Backend Commands

```bash
# Start API server
uvicorn services.api.main:app --reload --port 8010

# Run backend tests
python -m pytest backend_tests -v

# Run live API smoke tests after starting the backend on port 8010
RUN_PRODUCTION_SMOKE=1 python -m pytest backend_tests/test_production_smoke.py -v

# Run manual data refresh (local fixtures)
python -m services.ingestion.refresh

# Seed local Shopmetrics DB from Excel workbooks
python -m services.ingestion.seed_local_dummy_db

# Start Celery worker (use --pool=solo on Windows)
celery -A services.ingestion.celery_app worker --loglevel=info --pool=solo --concurrency=4

# Start Celery beat scheduler (triggers every 6h by default)
celery -A services.ingestion.celery_app beat --loglevel=info
```

## Frontend Commands

```bash
npm run dev        # Development server
npm run build      # Production build
npm start          # Production server
npm test           # Run frontend tests
```

## Production Deployment

### Docker Compose

```bash
# Copy and configure production environment
cp .env.production.template .env.production
# Edit .env.production with strong secrets

# Build and start all services
docker-compose -f docker-compose.prod.yml up -d
```

### Services

- **PostgreSQL** — Port 5432
- **PgBouncer** — Port 6432 (connection pooling)
- **Redis** — Port 6379
- **Backend API** — Port 8000
- **Frontend** — Port 3000
- **Celery Worker** — Processes refresh tasks (concurrency 4)
- **Celery Beat** — Scheduler (triggers tenant refresh every 6h)
- **Nginx** — Ports 80/443 (reverse proxy, SSL termination)
- **Backup** — Periodic Postgres backups

### Health Checks

```bash
curl http://localhost:8000/healthz
curl http://localhost:8000/readyz
curl http://localhost:8000/metrics
```

## Data Ingestion

The ingestion pipeline pulls Shopmetrics data and transforms it into the normalized `dashboard` schema.

### Two Modes

- **Local fixtures** — Reads from Excel workbooks (`fixtures/`), no external API calls. Used for development and testing.
- **Live Shopmetrics** — Uses OAuth2 (`client_credentials` grant) and the Shopmetrics Query API (`POST /api/v2/execute`). Requires valid credentials.

### Pipeline

1. **Extract** — `ShopmetricsExtractor` pulls 12 resources (7 reference, 5 transactional) via `ShopmetricsClient`
2. **Transform** — `transform_shopmetrics_rowsets()` normalizes rowsets into visits, photos, and metrics
3. **Load** — `load_transformed_dataset()` upserts into `dashboard.*` tables (Postgres)

### Scheduling

- **On-demand:** `POST /admin/tenants/{id}/refresh` (via UI or API) dispatches a Celery task
- **Scheduled:** Celery Beat triggers `scheduled_refresh_all_tenants` every 6 hours (configurable via `SCHEDULED_REFRESH_INTERVAL_HOURS`)
- **Per-tenant toggle:** Scheduled refresh can be enabled/disabled per tenant via Redis

### Repository Pattern

The backend supports two backends, controlled by `BACKEND_REPOSITORY` env var:

- **`memory`** (default) — In-memory store seeded from workbooks, for development
- **`postgres`** — AsyncPG-backed production implementation with connection pooling

## Security

- **Password Storage:** PBKDF2-SHA256 (120,000 iterations)
- **Token Storage:** httpOnly cookies (XSS-resistant)
- **Secret Encryption:** AES-256-GCM
- **Rate Limiting:** Redis-backed (falls back to in-memory)
- **Tenant Isolation:** Enforced at repository layer
- **RBAC:** ADMIN and CLIENT roles with project-scoped access

## Multi-Tenancy

- `tenant_id` is established at ingestion time and immutable
- JWT claims include `sub`, `tenant_id`, `role`, and `project_ids`
- Backend endpoints never accept `tenant_id` from user-controlled input
- Every database query requires explicit tenant context
- CLIENT users can only access projects in their `tenant_id` and `project_ids`
- ADMIN users may access all tenants (role check required)

## Data Baseline

Sample data remains the acceptance baseline until live Shopmetrics credentials are available:

- **Client:** Brasserie Labatt
- **Project:** Messi and Flying Fish
- **Total visits:** 436
- **Date range:** 2026-03-06 through 2026-04-08
- **Survey ID:** 1737162 (must remain present)

## Documentation

- [`CLAUDE.md`](./CLAUDE.md) — Agent orientation brief
- [`.claude/`](./.claude/) — Rules, agents, skills, and templates
- [`documentation/`](./documentation/) — API docs and backend documentation
- [`services/README.md`](./services/README.md) — Backend development guide

## Testing

```bash
# Backend tests
python -m pytest backend_tests -v

# Frontend tests
npm test
```

## License

Private — Shopmetrics Platform
