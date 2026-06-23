---
name: testing-strategy
description: Use when writing or reviewing tests in this dashboard — the test pyramid, pytest backend organization + fixtures/mocks, Vitest frontend tests, contract/parity tests, deterministic factory data, CI ordering, and the known coverage gaps. Source: knowledge_base/09_TESTING_STRATEGY.md.
---

# Testing Strategy

## Pyramid & categories
Many **unit** tests (fast, cheap), some **integration** (boundaries), few **E2E** (whole system).
Plus **contract** tests (interface guarantees) and **smoke** tests (basic health). Test behavior
and boundaries, not implementation/internals — a test that breaks on refactor was testing the
wrong thing.

## Backend (pytest, `backend_tests/`)
Organize by feature: `test_security.py` (JWT, hashing), `test_repository.py`, `test_tenancy.py`
(multi-tenant isolation), `test_shopmetrics_*.py`, `test_transform.py`, `test_rate_limiter.py`,
`test_refresh.py`, `test_password_reset.py`. Use fixtures for setup/teardown, mock external API
calls, use the InMemory repository, and factory functions for data.

**Known gaps to close (Sprint 2 / P4):** no tests for `postgres_repository.py`; no HTTP-level
two-tenant isolation test; ingestion idempotency untested; rate-limit thresholds untested.

## Frontend (Vitest, `tests/`)
Existing contracts: `rbac.test.ts`, `seed-parity.test.ts`, `provider-contract.test.ts`,
`chart-helpers.test.ts`, `active-window.test.ts`, `cascading-filters.test.ts`. Node environment;
test the **contracts between layers** so implementations can change safely. **The tests define
the contract for the missing `src/lib/*.ts` files — make them pass, don't edit them to fit code.**

## Test data
Deterministic, generated via factories (not hardcoded), realistic, no external deps. Seed/parity
data is documentation of what valid data looks like; regenerate when the schema changes.

## CI & anti-patterns
CI order: lint+typecheck → unit → integration → build images → smoke. Parallel, isolated DBs,
clean state, timeouts. Avoid: testing implementation details / framework behavior, over-mocking,
brittle tests, slow tests.

**Full detail:** `knowledge_base/09_TESTING_STRATEGY.md`. TDD discipline: invoke the `tdd` skill.
