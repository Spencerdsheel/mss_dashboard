---
name: decision-records
description: Use when a change might contradict an established architectural decision in this dashboard, or when recording a new one — the 10 ADRs (server-first RSC, repository pattern, multi-tenancy at data layer, JWT in httpOnly cookies, no ORM, Celery, shadcn/ui, PgBouncer, AES-256-GCM secrets, no silent fallbacks). Source: knowledge_base/10_DECISION_RECORDS.md.
---

# Architectural Decision Records

These are settled decisions. Don't silently reverse one — if a task seems to require it, flag it.

| ADR | Decision | Why it matters |
|---|---|---|
| 001 | **Server-first** (Next.js App Router + RSC; client only for interactivity) | smaller bundle, no secrets on client, simpler state |
| 002 | **Repository pattern** (Protocol; InMemory dev / Postgres prod; env-switched) | testable, swappable, clear separation |
| 003 | **Multi-tenancy at the data-access layer** (every method needs AuthClaims; tenant_id never from user) | impossible to read another tenant's data |
| 004 | **JWT in httpOnly cookies** (Secure + SameSite) | XSS-resistant; CSRF handled by Next.js |
| 005 | **No ORM** (raw async asyncpg; SQLAlchemy for migrations only) | query control, read performance |
| 006 | **Celery + Redis** for background work; Beat for scheduling | mature, retry built-in, scales |
| 007 | **shadcn/ui** (copy-paste, Radix + Tailwind) | accessible, fully customizable, no lock-in |
| 008 | **PgBouncer** transaction-mode pooling (≤500 conns) | efficient multiplexing (no prepared statements) |
| 009 | **AES-256-GCM** for provider secrets at rest | useless to attackers if DB breached |
| 010 | **No silent fallbacks** (never live→sample silently) | users know when something's wrong; see `.claude/rules/sample-data.md` |

**To record a new decision:** add an ADR (context → decision → consequences) to
`knowledge_base/10_DECISION_RECORDS.md` and note any rule/skill it changes.

**Full detail:** `knowledge_base/10_DECISION_RECORDS.md`.
