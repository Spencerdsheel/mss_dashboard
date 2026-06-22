# Local Fake Shopmetrics And Dummy DB

Use this while waiting for real Shopmetrics credentials. It gives you two local
testing surfaces:

- A fake Shopmetrics API backed by `documentation/sample_raw_data`.
- A dummy Postgres schema you can inspect in pgAdmin.

## 1. Install Backend Dependencies

```bash
pip install -r requirements-backend.txt
```

## 2. Start Postgres

```bash
docker compose up -d
```

## 3. Seed The Dummy Source DB

This loads workbook rows into the `local_shopmetrics` schema in the existing
`shopmetrics_demo` database.

```bash
python -m services.ingestion.seed_local_dummy_db
```

Expected output:

```text
Seeded local_shopmetrics dummy DB: 435 raw visits, <photo row count> photo rows
```

In pgAdmin, connect to:

- Host: `localhost`
- Port: `5432`
- Database: `shopmetrics_demo`
- User: `postgres`
- Password: `postgres`

Inspect:

- `local_shopmetrics.raw_visits`
- `local_shopmetrics.photo_urls`

Note: the raw Shopmetrics export contains 435 survey rows. The existing
dashboard parity baseline has 436 normalized visits because it preserves one
extra normalized record documented in the MVP sample-data rules.

## 4. Start The Local API

Use any free port. Example:

```bash
uvicorn services.api.main:app --reload --port 8010
```

Health check:

```text
GET http://localhost:8010/healthz
```

Fake Shopmetrics base URL:

```text
http://localhost:8010/fake-shopmetrics
```

## 5. Postman Calls

### Token

`POST http://localhost:8010/fake-shopmetrics/oauth/connect/token`

Body type: `x-www-form-urlencoded`

```text
client_id=local
client_secret=local
grant_type=client_credentials
```

Expected response:

```json
{
  "access_token": "local-fake-shopmetrics-token",
  "token_type": "Bearer",
  "expires_in": 1800
}
```

### Query Clients

`POST http://localhost:8010/fake-shopmetrics/api/v2/execute`

Body type: `x-www-form-urlencoded`

Field name: `post`

Value:

```json
{"action":"exec","dataset":{"datasetname":"/Apps/SM/APIv2/Query/ClientAnalytics/Clients"}}
```

### Query Survey Instances

`POST http://localhost:8010/fake-shopmetrics/api/v2/execute`

Body type: `x-www-form-urlencoded`

Field name: `post`

Value:

```json
{"action":"exec","dataset":{"datasetname":"/Apps/SM/APIv2/Query/ClientAnalytics/ClientAnalytics"},"parameters":[{"name":"QuerySpecification","value":"[InstanceID][ProtoSurveyID][Date][Location Store ID][Campaign]"},{"name":"ClientOrFormIDs","value":"-1001"}]}
```

## 6. Extractor Configuration

When testing the extractor manually, use:

```text
base_url=http://localhost:8010/fake-shopmetrics
client_id=local
client_secret=local
```

This exercises the same OAuth and `/api/v2/execute` paths as the real client,
but no live Shopmetrics calls are made.

## 7. Load Dashboard-Ready Phase 03 Tables

After the dummy source DB is seeded, run:

```bash
python -m services.ingestion.transform_local_dummy_db
```

This creates the `dashboard` schema and loads:

- `dashboard.raw_rowsets`: raw fake-Shopmetrics rowsets for audit/debugging.
- `dashboard.visits`: tenant-stamped dashboard visit rows.
- `dashboard.visit_photos`: tenant-stamped photo links.
- `dashboard.project_metrics`: project target/reference metrics.

Curated views:

- `dashboard.vw_project_summary`
- `dashboard.vw_photo_counts`
- `dashboard.vw_visit_detail`

Useful pgAdmin checks:

```sql
SELECT * FROM dashboard.vw_project_summary;
SELECT COUNT(*) FROM dashboard.raw_rowsets WHERE resource_name = 'survey_instances';
SELECT COUNT(*) FROM dashboard.visits;
SELECT * FROM dashboard.vw_photo_counts ORDER BY kind;
```

Expected Phase 03 behavior:

- `dashboard.raw_rowsets` preserves the 435 raw survey instances from the
  source export.
- `dashboard.visits` contains 436 dashboard-ready rows because the known extra
  normalized survey ID `1737162` is added as a compatibility record.
- Every dashboard row has `tenant_id = 'tenant_labatt'` and
  `project_id = 'project_messi_flying_fish'`.

## 8. Phase 05 Admin Refresh Test

Start the API with Postgres enabled:

```bash
$env:BACKEND_REPOSITORY="postgres"
$env:DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:YOUR_PORT/shopmetrics_demo"
uvicorn services.api.main:app --reload --port 8010
```

Login as admin:

```text
POST http://localhost:8010/auth/login
```

Body:

```json
{"email":"admin@demo.local","password":"Demo123!"}
```

Configure the local fake Shopmetrics connection:

```text
PATCH http://localhost:8010/admin/tenants/tenant_labatt/shopmetrics-connection
```

Body:

```json
{
  "base_url": "http://localhost:8010/fake-shopmetrics",
  "client_id": "local",
  "client_secret": "local",
  "status": "active"
}
```

The response includes `has_client_secret: true`, but does not return the secret.

Trigger refresh:

```text
POST http://localhost:8010/admin/tenants/tenant_labatt/refresh
```

Check run logs:

```text
GET http://localhost:8010/admin/runs
```
