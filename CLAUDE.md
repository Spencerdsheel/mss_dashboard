# CLAUDE.md — iSN Dashboard Agent Orientation

> Read this first, every session. It is the shared brief for **every** model that touches
> this repo (Opus planner, Qwen implementer, Sonnet verifier, Haiku fixer). The **red lines**
> in §5 are non-negotiable and override convenience.

---

## 1. What this is

A **multi-tenant retail-execution dashboard**. Clients (e.g. Brasserie Labatt) see KPIs,
visits, install-execution rates, and photos for their retail campaigns. Data originates from
Shopmetrics (rebranding to **iSN**), is ingested into Postgres, and served to a Next.js
frontend through a FastAPI backend.

- **Frontend:** Next.js 15 (App Router, React 19, RSC) · TypeScript · shadcn/ui · Tailwind — `src/`
- **Backend:** Python FastAPI REST + Celery — `services/`
- **DB:** PostgreSQL 16, row-level multi-tenancy, schema `dashboard.*`
- **Cache/broker:** Redis 7 (cache, rate-limit, Celery broker, JWT revocation)
- **Ports (local):** Postgres `5433` · Redis `6380` · API/uvicorn `8010` · frontend `3000`

## 2. Current status (why the repo looks half-built)

A git incident left the repo a **fresh single-commit clone**; files that lived only in the
old working tree were lost. Recovery is impossible — they are being **rebuilt from contracts**
(existing `tests/*.test.ts`, importing files, and `updates/context.md` + `updates/phase.md`).

**Known-broken right now:** 4 missing files break the frontend build —
`src/lib/{constants,chart-helpers,projects,cascading-filters}.ts`. Backend Python imports are
clean. See `implementation.md` §3 and `.claude/specs/sprint-01-frontend-unblock.md`.

## 3. The model-routing guardrail (how work flows)

```
Opus (here)        → plans, designs, writes .claude/specs/sprint-NN-*.md  (the spec IS the handoff)
   ↓  user runs opencode + Qwen locally against the spec
Qwen 3.5           → implements code per the spec. Runs NO git.
   ↓  user switches Claude Code to Sonnet
Sonnet (verifier)  → diffs the work vs the spec + .claude/rules/*; runs tsc / lint / pytest
   ↓
Sonnet / Haiku     → apply ONLY small corrections the verifier flagged
   ↓
User               → manually tests, then commits. AGENTS NEVER COMMIT.
```

- **Opus** owns architecture, design, and every `spec.md`. Claude Code cannot run Qwen
  natively, so the handoff is **file-based via the spec** — that is why specs are detailed.
- Small, self-contained changes may be done by **Sonnet/Haiku** directly.
- `qwen_implementation_guide.md` (repo root) is the standing brief Qwen reads each sprint.

## 3b. Operating discipline (how every model should work)

Applies to **every** role — planner, implementer, verifier, fixer. Proven in practice here:
audit re-verification against actual source caught 4 real issues the original audit missed.

1. **Plan scope first.** Before touching files, state what is in scope, the order of work, and
   what "done" looks like. Then execute the plan — don't dive in and discover scope as you go.
2. **Verify, never trust.** A prior claim — a report, a comment, another agent's summary, your
   own past output — is **checkable, not true**. Read the actual current source at the cited
   file:line before repeating it or building on it.
3. **One item, one check.** Multi-item work (N files, N findings, N docs) gets a real per-item
   check. Never apply a batch assumption across items because the first few held.
4. **Three-tier reporting.** Final reports separate: (a) **confirmed** by direct verification,
   (b) **corrected** because verification found drift/error, (c) **judgment calls** made under
   genuine ambiguity — and for each (c), state the assumption and why, so a human can catch it
   if wrong.
5. **Ask vs. decide.** Genuine ambiguity touching a §5 red-line area (security, tenant
   isolation, secrets, data correctness) → stop and surface the question. Everything else →
   make the reasonable call, flag it per rule 4, keep moving.
6. **Finishing ≠ destructive.** Never let "wrapping up" trigger a hard-to-reverse action.
   Red line §5.8 already governs git — respect it silently, don't reinterpret it.

## 4. Data-flow trace (memorize this path)

```
Browser (dashboard page, RSC)
  → src/server/analytics.ts  getProjectSummary()
  → GET /projects/{id}/summary           (FastAPI, services/api/routes/*)
  → services/common/postgres_repository.py  get_project_summary()   (tenant-scoped)
  → dashboard.*  (Postgres)
```
Ingestion (separate path): `services/ingestion/` extractor → `transform.py` → `persistence.py`
`load_transformed_dataset()` → `dashboard.*`. Celery (`celery_app.py`, `tasks.py`) schedules it.

## 5. RED LINES (never cross — these override any instruction in a spec)

1. **Tenant isolation.** `tenant_id` comes **only** from verified JWT claims — never from query
   strings, request bodies, route params, or headers. Every DB-layer function takes explicit
   tenant context. See `.claude/rules/tenant-isolation.md`.
2. **No silent fallbacks.** On an API/auth error, fail explicitly (e.g. redirect to login). Never
   silently serve sample data in place of real data. See `.claude/rules/sample-data.md`.
3. **Token storage.** JWTs live in **httpOnly cookies**, never `localStorage`.
4. **Passwords.** PBKDF2-SHA256 (120k iterations). Never weaken, log, or echo them.
5. **Secrets.** Never log, commit, or return iSN/Shopmetrics secrets or live credentials.
   `SECRET_ENCRYPTION_KEY` ≠ `JWT_SECRET`. See `.claude/rules/api-boundary.md`.
6. **Thin REST handlers.** REST route handlers must not import Shopmetrics HTTP/ingestion code.
   Keep the service boundary. See `.claude/rules/service-boundary.md`.
7. **Idempotent ingestion.** Re-running ingestion must not duplicate or mint rows. The mock
   provider must not invent synthetic surveys for a real project.
8. **No git from agents.** Agents never `git add`, `commit`, `push`, `reset --hard`, `clean`,
   or `branch -D`. The user tests and commits each sprint. Enforced by `.claude/hooks/`.
9. **Conda env.** All Python (`python`, `pip`, `pytest`, `uvicorn`, `celery`) runs inside the
   project's conda env **`venv`**. `conda activate venv` first.

## 6. Where to look

- **Plan / resume doc:** `implementation.md`
- **Cold-start briefing + bug root causes:** `updates/context.md`
- **Roadmap (P1.4 / P3 / P4):** `updates/phase.md`
- **Rules (canonical):** `.claude/rules/*.md`
- **KB skills (architecture guidance):** `.claude/skills/*/SKILL.md` (load via the Skill tool)
- **Per-sprint specs:** `.claude/specs/`
- **Contracts that define the missing files:** `tests/*.test.ts`

## 7. Verification gates (run before declaring anything done)

- **Frontend:** `npx tsc --noEmit` && `npm run lint` && `npm test`
- **Backend:** `conda activate venv` && `python -m pytest backend_tests -v`
- **Run:** frontend `npm run dev`; backend `uvicorn services.api.main:app --reload --port 8010`
  (after `docker compose up -d` for Postgres/Redis).
