---
name: api-services
description: Use when designing or reviewing REST endpoints in this dashboard — resource URL design, Pydantic request/response models, DI for auth/authz, cache-aside + TTL + invalidation, multi-tier rate limiting, consistent error format with correlation IDs, and health/readiness/metrics endpoints. Source: knowledge_base/03_API_SERVICES.md.
---

# API Services

## REST design
- **Resource-based URLs**, no verbs: `/projects`, `/projects/{id}/visits`, `/projects/{id}/summary`.
  HTTP verbs convey intent (GET read, POST create/trigger, PATCH update).
- **Pydantic models** on every endpoint = validation (auto-422) + response shape + OpenAPI docs.
  The contract lives in code.
- **DI for cross-cutting concerns**: authn (validate JWT), authz (role/permission), repository
  selection, DB session. Runs before the handler; can short-circuit.

## Caching (cache-aside)
- Keys include tenant + resource: `summary:{tenant_id}:{project_id}`, `visits:{tenant_id}:{project_id}`.
- TTL reflects volatility: summary 5m, visits 2m, user profile 30m, config 60m.
- Invalidate on mutation (POST/PATCH) and after ingestion; **never on read paths**. Keep
  invalidation next to the mutation.

## Rate limiting (a security control)
- Tiers: auth 10/min (by IP), admin 5/hr (by user+role), global 100/min (by user id).
- Redis-backed, in-memory fallback, sliding window, `X-RateLimit-*` headers.

## Errors
- Consistent shape: `error` (UPPER_SNAKE_CASE, stable, part of the contract), friendly `message`,
  `correlation_id`. Generate the correlation ID at entry, propagate through every layer and log.

## Health
- `/healthz` liveness (no deps). `/readyz` readiness (checks DB + Redis). `/metrics` Prometheus
  (request counts/latency/error rate + business metrics). Liveness ≠ readiness.

**Full detail:** `knowledge_base/03_API_SERVICES.md`. Keep handlers thin — `.claude/rules/service-boundary.md`.
