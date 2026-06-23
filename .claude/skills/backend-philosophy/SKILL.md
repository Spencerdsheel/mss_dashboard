---
name: backend-philosophy
description: Use when implementing or reviewing FastAPI backend code in this dashboard — dependency injection, the repository Protocol, async asyncpg data access, multi-tenancy enforcement, structured logging, Pydantic settings, cache-aside, Celery tasks, the exception hierarchy, and password/secret crypto. Source: knowledge_base/02_BACKEND_PHILOSOPHY.md.
---

# Backend Philosophy

## Foundations
- **FastAPI** for validation, OpenAPI docs, DI, and async out of the box.
- **Dependency injection** for cross-cutting concerns: auth claims extraction, repository
  provisioning, DB session lifecycle, tenant-context propagation. DI is also where a request
  can be short-circuited (authz).
- **Repository Protocol.** Interface via `Protocol`; one impl per backend; switch by env var.
  **No repository method works without tenant context (AuthClaims).**
- **Async-first DB.** asyncpg directly, no ORM — full SQL control, explicit transactions, fast
  reads. Follow the query patterns in `postgres_repository.py`.

## Multi-tenancy enforcement (the spine)
JWT carries `tenant_id` → DI extracts claims → repository methods require claims → SQL filters by
`tenant_id` → response strips internal tenant fields. `tenant_id` is **never** from user input,
is set at ingestion, and is immutable. See `.claude/rules/tenant-isolation.md`.

## Operational
- **Structured JSON logging** with a correlation ID and contextual fields (tenant_id, user_id,
  endpoint). Never log secrets/passwords/tokens.
- **Pydantic Settings**: validate at startup, fail fast on missing required config.
- **Cache-aside** with tenant-keyed keys; tuned TTLs; invalidate on mutation, never on reads.
- **Connection pooling** (PgBouncer transaction mode).

## Background work (Celery)
Design every task as if it will be retried 3×: **idempotent**, atomic, clear success/failure,
detailed logs. Exponential backoff for external API calls. Beat for scheduling.

## Errors & security
- Custom exception hierarchy (`AppException` → NotFound/Authorization/RateLimit/Validation),
  one centralized handler → correct HTTP status + correlation ID + safe message.
- **Defense in depth**: network → app → auth → authz → data. Each layer assumes the one above
  is compromised.
- **PBKDF2-SHA256 (120k iters)**, per-password salt, timing-safe compare. **AES-256-GCM** for
  provider secrets, per-encryption nonce, verified auth tag. Never roll your own crypto.

**Full detail:** `knowledge_base/02_BACKEND_PHILOSOPHY.md`. Related: `.claude/skills/security-patterns`.
