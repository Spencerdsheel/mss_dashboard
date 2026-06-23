---
name: architecture-index
description: Use first when you need to find which architecture guidance applies to a task in this dashboard, or want the system's core philosophy at a glance. Indexes the 13 other KB skills and points to the right one. Source: knowledge_base/00_INDEX.md.
---

# Architecture Index

The knowledge base captures transferable patterns from this platform. Each `knowledge_base/*`
file is also a loadable skill. Start here, then load the specific skill you need.

## Core philosophy (the 7 foundations)
1. **Server-first** — push logic to the server, minimize client JS.
2. **Security by default** — every layer assumes hostility.
3. **Tenant isolation** — multi-tenancy is mandatory, not optional.
4. **Repository abstraction** — contracts over implementations.
5. **Observability** — if you can't measure it, you can't manage it.
6. **Graceful degradation** — fail predictably.
7. **No silent fallbacks** — explicit failures over hidden degradation.

## Which skill for which task

| Task area | Skill | KB source |
|---|---|---|
| Layering, patterns, system-level choices | `system-design` | 01 |
| FastAPI backend, DI, repo, async DB, crypto | `backend-philosophy` | 02 |
| REST endpoints, caching, rate limit, errors, health | `api-services` | 03 |
| Next.js RSC, providers, routing, state | `frontend-architecture` | 04 |
| Colors, type, cards, animation, shadcn, a11y | `ui-design-system` | 05 |
| Ingestion, transform, UPSERT, Celery, idempotency | `data-pipeline` | 06 |
| JWT, RBAC, PBKDF2, AES, headers, validation | `security-patterns` | 07 |
| Docker, Nginx, PgBouncer, observability, deploy | `infrastructure` | 08 |
| Test pyramid, pytest/Vitest, contracts, gaps | `testing-strategy` | 09 |
| Settled architectural decisions (don't reverse) | `decision-records` | 10 |
| Production-readiness breadth checklist | `backend-components-checklist` | Backend Components |
| Roles, claims, tenant/project scoping, test matrix | `rbac-model` | RBAC_MODEL |
| Slow views, virtualization, memoization, caching | `frontend-performance` | frontend_optimization_guide |

## Also see (not KB skills, but authoritative)
- **Red lines & orientation:** `CLAUDE.md`
- **Canonical rules:** `.claude/rules/*.md`
- **Implementer brief:** `qwen_implementation_guide.md`
- **Roadmap / bugs:** `updates/phase.md`, `updates/context.md`
- **Per-sprint specs:** `.claude/specs/`

**Full detail:** `knowledge_base/00_INDEX.md`.
