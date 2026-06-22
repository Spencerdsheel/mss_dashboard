# Backend Services

Phase 01 introduces the Python backend service layout without replacing the
existing Next.js/Prisma sample path.

## Packages

- `services/common`: shared settings, domain models, security, tenant policy,
  and repository contracts.
- `services/api`: FastAPI REST service and route skeletons.
- `services/ingestion`: Shopmetrics extraction client, resource definitions, and
  mocked extractor orchestration. Transform/persistence begins in Phase 03.

## Persistence Ownership

The existing Prisma schema remains active for the current sample dashboard.
Python/Alembic becomes the production backend schema owner in later phases. Do
not delete or bypass the Prisma path until the corresponding REST-backed UI path
has parity coverage.

## Local Phase 01 Smoke Test

Install backend dependencies:

```bash
pip install -r requirements-backend.txt
```

Run the API:

```bash
uvicorn services.api.main:app --reload --port 8000
```

Expected health response:

```bash
curl http://localhost:8000/healthz
```

```json
{"status":"ok","service":"shopmetrics-dashboard-api"}
```

Default Phase 01 fixture accounts:

- `admin@demo.local` / `Demo123!`
- `client@demo.local` / `Demo123!`
- `other@demo.local` / `Demo123!`

## Local Phase 02 Extractor Test

Phase 02 does not require live Shopmetrics credentials. Run the mocked extractor
tests:

```bash
python -m unittest discover backend_tests
```

Covered behavior:

- OAuth token request shape.
- Query API request shape.
- 12 documented resource fetch definitions.
- Negative Shopmetrics Client IDs for `ClientOrFormIDs`.
- 401 token refresh.
- 5xx and timeout retry.
- Non-401 4xx hard failure.

Live calls must not be made until credentials are available and the current
Shopmetrics API contract has been verified.

## Local Fake Shopmetrics

See `services/LOCAL_FAKE_SHOPMETRICS.md` for Postman and pgAdmin instructions
using the sample raw workbooks as local fixture data.

## Local Phase 03 Transform

Phase 03 transforms fake Shopmetrics rowsets into the local `dashboard` schema:

```bash
python -m services.ingestion.transform_local_dummy_db
```

This is idempotent for visits, raw rowsets, and metrics; photos are replaced for
the project on each run so stale photo links do not linger.

## Local Phase 04 REST Reads From Postgres

After Phase 03 tables are loaded, point the API at Postgres:

```bash
$env:BACKEND_REPOSITORY="postgres"
$env:DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:YOUR_PORT/shopmetrics_demo"
uvicorn services.api.main:app --reload --port 8010
```

Login with the fixture user:

```text
POST http://localhost:8010/auth/login
```

Then use the returned bearer token against:

```text
GET http://localhost:8010/projects
GET http://localhost:8010/projects/project_messi_flying_fish/summary
GET http://localhost:8010/projects/project_messi_flying_fish/visits
GET http://localhost:8010/projects/project_messi_flying_fish/visits/1737162
```

The Next.js helper `src/server/backend-api.ts` is the migration foundation for
page-by-page UI conversion in later Phase 04 work.

## Local Phase 05 Admin Operations

With `BACKEND_REPOSITORY=postgres`, admin endpoints can manage local operational
metadata:

```text
GET    /admin/tenants
POST   /admin/tenants
PATCH  /admin/tenants/{tenant_id}
PATCH  /admin/tenants/{tenant_id}/shopmetrics-connection
POST   /admin/tenants/{tenant_id}/refresh
GET    /admin/runs
GET    /admin/users
POST   /admin/users
PATCH  /admin/users/{user_id}
GET    /admin/projects/{project_id}/photo-slots
PATCH  /admin/projects/{project_id}/photo-slots
```

Use `admin@demo.local` / `Demo123!` to get an admin bearer token. Provider
secrets are encrypted for local storage and are never returned by read endpoints.
