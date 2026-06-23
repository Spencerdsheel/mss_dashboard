---
name: infrastructure
description: Use when working on deployment/infra for this dashboard — Docker multi-stage + non-root containers + healthchecks, dev vs prod docker-compose, Nginx path routing + SSL + headers, PgBouncer/Postgres tuning, backups, Prometheus + structured logging + Sentry observability, env parity, config management, and zero-downtime deploys. Source: knowledge_base/08_INFRASTRUCTURE.md.
---

# Infrastructure

## Containers
- **Multi-stage builds** (deps → builder → minimal runner) for small images.
- **Non-root** containers, explicit file permissions.
- **Healthchecks** per service: backend `/healthz`, frontend `/`, Postgres `pg_isready`,
  Redis `redis-cli ping`.

## Compose
- **Dev:** Postgres + Redis only (ports 5433 / 6380); backend + frontend run locally with hot
  reload; env from `.env`. **All Python in the conda env `venv`** (`conda activate venv`).
- **Prod:** 9 services — Postgres, PgBouncer, Redis, Backend, Frontend, Celery Worker, Celery
  Beat, Nginx, Backup. Same infra as dev, different scale.

## Nginx (the edge)
Path routing: `/api`,`/auth`,`/admin`,`/metrics`,`/healthz`,`/readyz` → backend; `/*` → frontend.
SSL termination at Nginx (backend gets plain HTTP); Let's Encrypt; security headers centralized here.

## Database
PgBouncer transaction-mode pooling (≤500 client conns), production `postgresql.conf` tuning,
automated `pg_dump` backups with a **tested restore** procedure.

## Observability
- **Prometheus** metrics (request counts/latency, error rates, pool stats, cache hit rate,
  business metrics) — "what is happening."
- **Structured JSON logs** with correlation IDs — "why it happened." Need both.
- **Sentry** for error tracking (stack traces, user context, release tracking).

## Deployment
Env parity dev/staging/prod. Config via env vars only; `.env.example` documents; no secrets in
code/config; Pydantic Settings validates. Zero-downtime: blue-green/rolling, backward-compatible
migrations, healthcheck before traffic switch, rollback ready. Deployments should be boring.

**Full detail:** `knowledge_base/08_INFRASTRUCTURE.md`. Local run commands: `qwen_implementation_guide.md` §4.
