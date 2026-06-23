---
name: data-pipeline
description: Use when working on ingestion in this dashboard — the OAuth2→Extractor→Transform→Persistence stages, idempotent extraction, UPSERT loading, Celery task design + beat schedule + retry/backoff, data-quality validation, idempotency keys, run-log monitoring, and SQL schema management. Source: knowledge_base/06_DATA_PIPELINE.md.
---

# Data Pipeline

## Stages
`External API → OAuth2 client → Extractor → Transform → Persistence → PostgreSQL`, dispatched on
Celery workers. In this repo: `client.py` → `extractor.py`/`resources.py` → `transform.py` →
`persistence.py` (`load_transformed_dataset()`).

- **OAuth2 client**: resilient — token refresh, rate-limit awareness, retry w/ exponential backoff.
- **Extractor**: orchestrates resource pulls, pagination, partial-failure handling; **idempotent**
  (running twice == running once).
- **Transform**: external format → normalized schema; validate early, fail fast, log everything;
  enrich with tenant context. **Never calls the live API** (`.claude/rules/service-boundary.md`).
- **Persistence**: `INSERT ... ON CONFLICT (tenant_id, <natural key>) DO UPDATE`; batch ops;
  transaction boundaries; run-log audit trail.

## Idempotency (the spine of reliability)
UPSERT on natural keys (external API IDs / composite / hash). Same data arriving twice → second
load is a no-op. **Never mint synthetic rows** (that was Bug A — see `.claude/rules/workbook-parity.md`).

## Celery
- Categories: scheduled (beat, e.g. every 6h), manual (user-triggered), retry.
- Retry: exponential backoff + jitter, max retries, dead-letter for permanent failures, alert on
  repeated failure. Design every task to be retried 3×: idempotent, atomic, clear success/failure.

## Data quality & monitoring
- Required fields present, types match, referential integrity, business rules. Invalid rows are
  **logged, not silently dropped**; run logs track success/failure per resource.
- Metrics: rows/run, duration/resource, error rates, queue depth. Structured JSON logs + per-run
  correlation ID.

## Schema
Explicit SQL (`dashboard_schema.sql`), versioned migrations (Alembic), **backward-compatible
changes** (add columns with defaults, don't remove).

**Full detail:** `knowledge_base/06_DATA_PIPELINE.md`. Bug context: `updates/context.md`, `updates/phase.md`.
