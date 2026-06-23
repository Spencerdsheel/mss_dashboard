---
name: system-design
description: Use when designing or reviewing system-level structure in this dashboard — layering, the provider Strategy pattern, the repository pattern, multi-tenancy placement, sync vs async communication, config validation, scaling, or layered error handling. Source: knowledge_base/01_SYSTEM_DESIGN.md.
---

# System Design

Apply these when shaping where a piece of logic lives or how layers talk.

## Layered architecture (strict boundaries)
Client (Next.js RSC) → Provider abstraction (REST/Sample/Direct) → API gateway (Nginx) →
FastAPI service → Repository (Protocol: InMemory/Postgres) → Data (Postgres, Redis).
**The frontend never touches the database directly.**

## The patterns to reach for
- **Strategy for data sources.** Define the interface at the boundary; swap REST/Sample/Direct
  implementations via env config without changing UI code.
- **Repository for data access.** A Protocol/interface; one impl per backend; switch by env var.
  Every method takes tenant context as a **required** parameter.
- **Multi-tenancy is first-class** and enforced at the **repository layer**, not the API layer.
  `tenant_id` is set at ingestion, lives in the JWT, and is never accepted from user input.
- **Server-first.** Fetch on the server (RSC), mutate via server actions, session in httpOnly
  cookies, minimal client JS.

## Graceful degradation — which fallbacks are allowed
- OK: Redis down → in-memory rate limiting; replica down → primary.
- **NOT OK:** silently falling back from live data to sample data. (See `.claude/rules/sample-data.md`.)

## Communication
- Sync: frontend→backend REST/HTTPS; backend→DB async asyncpg; backend→Redis.
- Async (Celery + Redis broker): anything longer than a request cycle, non-user-facing,
  retryable, or batchable.

## Config & errors
- Validate all env vars at startup with Pydantic Settings / Zod. Fail fast on missing config.
  `.env.example` is documentation, not defaults.
- Layered error handling: repository → domain exception; service → context; API → HTTP +
  correlation ID; frontend → friendly message. Never leak internal error detail to clients.

**Full detail:** `knowledge_base/01_SYSTEM_DESIGN.md`.
