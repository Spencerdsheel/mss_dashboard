# Codex Implementation Guide (standing brief)

> You are **Codex 5.5**, the implementer, running via the Codex CLI. Read this file at the
> start of **every** sprint, then read the sprint spec you were given. Opus wrote the spec;
> your job is to implement it exactly. Sonnet will verify your work afterward.
>
> Note: existing specs may say "Implementer: Qwen 3.5 via opencode" and point at
> `qwen_implementation_guide.md` — that role is now yours, and **this** file replaces that
> guide for you. Everything else in the specs applies unchanged.

---

## 1. The chain, and your place in it

```
Opus        → plans, writes .claude/specs/sprint-NN-<topic>.md   (the spec IS the handoff)
Codex 5.5   → implements exactly what the spec says. Runs NO git.
Sonnet      → verifies the diff against the spec + .claude/rules/*; runs the gates
User        → manually tests, then commits. AGENTS NEVER COMMIT.
```

1. Implement **only** what the spec lists — exact files, exact signatures, exact behavior.
2. Run the **verification gates** (§5) and make them pass.
3. Stop. You do **not** commit. Never run destructive git (`add`, `commit`, `push`,
   `reset --hard`, `clean`, `branch -D`). The user tests and commits.
4. If the spec is ambiguous, or seems to conflict with a red line (§3), **stop and flag it
   in your output** rather than guessing — never cross a red line to satisfy a spec.

## 2. Read these before touching code

- `CLAUDE.md` — the orientation brief and the red lines.
- The sprint spec — your actual task.
- `.claude/rules/*.md` — the canonical rules referenced by specs
  (`tenant-isolation`, `sample-data`, `api-boundary`, `service-boundary`, `workbook-parity`).
- The contract files the spec points at — usually `tests/*.test.ts` and the importing files.
  **Tests define the contract.** Make the existing tests pass; do not edit tests to fit code.

## 3. RED LINES (never cross — repeated from CLAUDE.md §5)

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

## 4. Environment & run commands (verified against current repo config)

```bash
# Python — always activate the conda env first
conda activate venv

# Infra: Postgres (host 5433), PgBouncer (host 5434), Redis (host 6380)
docker compose up -d

# The API and Celery worker automatically apply pending tracked SQL migrations
# before startup. For manual/CI inspection or application, use:
python -m services.ingestion.migrate --dry-run
python -m services.ingestion.migrate

# Backend API (port 8010)
uvicorn services.api.main:app --reload --port 8010

# Celery (Windows)
celery -A services.ingestion.celery_app worker --loglevel=info --pool=solo --concurrency=4

# Frontend (port 3000)
npm install --legacy-peer-deps
npm run dev
```

Notes:
- Postgres DB is `shopmetrics_demo` (user `postgres`); the schema in
  `services/ingestion/dashboard_schema.sql` auto-applies on first volume init.
- PgBouncer (transaction pooling) sits on host `5434`. When `DB_VIA_PGBOUNCER=1`, asyncpg
  must connect with `statement_cache_size=0` — see `PostgresDashboardRepository.initialize_pool`.

## 5. Verification gates (must pass before you stop)

**Frontend changes:**
```bash
npx tsc --noEmit      # no type errors
npm run lint          # clean
npm test              # all green (Vitest)
```
**Backend changes:**
```bash
conda activate venv
python -m pytest backend_tests -v
```
**Actually run these and report the real output.** Never claim "passing" without running the
command; paste or summarize the genuine result, including failures.

## 6. The current sprint queue (your next work)

Ten specs exist under `.claude/specs/`, already senior-reviewed (13a/13b implemented + verified; 11/12
implemented; 13c/16/17/18 newly added by this planning pass — see their own headers for exact
dependency notes). Order matters:

| Spec | Covers |
|---|---|
| `sprint-11-provider-abstraction.md` | Ingestion provider protocol + registry (behavior-preserving refactor; DB state must stay byte-identical). |
| `sprint-12-provider-mock-second.md` | Second (mock) provider adapter proving the abstraction seam. **Depends on 11** — do not start until 11 is merged/verified. |
| `sprint-13a-widget-dashboard-renderer.md` | Widget registry, `dashboard.dashboard_layouts` table, `WidgetGrid` renderer, frozen default layout, read endpoint. |
| `sprint-13b-widget-dashboard-editor.md` | Admin edit mode + write endpoint. **Depends on 13a** — builds on its renderer/registry/table. |
| `sprint-13c-migration-runner.md` | Tracked, idempotent migration runner (`schema_migrations` table + apply-on-startup CLI) closing the "no migration tracking" gap that caused `dashboard_layouts` to go missing on a live dev DB. **Independent of 13a/13b's app logic** but should land before/alongside 14, 17, 18 since they add schema and should go through the tracked path, not a manual `psql` step. |
| `sprint-14-ai-layout-suggestion.md` | **SUPERSEDED by sprint 19 — do not implement further from this file.** Historical: documents the v1 AI-suggestion shape (8 widget types) that 19 widens in place. Kept for context only. |
| `sprint-15-nl-chart-requests.md` | **STUB ONLY — do not implement.** Intent placeholder with no real spec content; Opus must write the real spec first. |
| `sprint-16-shell-and-navigation-polish.md` | Sidebar drag-resize, collapse button moved to header, company name replaces email in header, `#username` sidebar line, breadcrumb, dark-theme date-picker icon fix, KPI-card density (Overview/Geography/Visits), Visits page gets a new 4-KPI row + "Edit dashboard" button (replacing "Visit List"). **Independent of 13c/14/17**; only its "Edit dashboard" wiring on Geography/Visits has a soft ordering note re: 17 (see its §4.8). |
| `sprint-17-widget-freeform-layout.md` | Freeform drag-and-drop-anywhere + arbitrary-size resize as a new opt-in `LayoutConfig` **v2** ("Advanced layout mode"), coexisting with 13a/13b's v1 preset system (architectural tradeoff documented in its §1 — v1 is unmodified, 14/19's AI generation keeps targeting v1 only). Also brings Geography onto the widget-grid system for the first time. **Depends on 13a + 13b; should land alongside/after 13c** (its migration, if any, goes through the tracked runner). |
| `sprint-18-locations-rename-and-chart-polish.md` | Rename "Geography" → "Locations" (nav/route/title, with a redirect from the old path), remove Banner Performance's bottom legend, add hover-driven labels to donut/pie charts, fix "Visits over Time" width. Pure frontend, no schema. **Independent of 13c/16/17** except a soft touch-point with 17 if Geography's widget extraction has already landed (check before editing shared files). |
| `sprint-19-ai-full-page-generation.md` | Generalizes sprint 14's AI layout suggestion into "Generate overview page (AI)": widens `layout_suggestion.py` and the widget-type allowlist (8 → 22 v1 primitives) in place — same service file, same endpoint, same preview-only/human-approved flow — plus sends `project_metrics` and a data-shape summary to Claude. Adds a **platform-admin on/off toggle** (`ai_layout_generation_enabled`, reusing the existing global `platform_settings` key/value mechanism — no new table) that gates the trigger with an explicit 403, distinct from the existing `ANTHROPIC_API_KEY`-unset 503. **Depends on 13a + 13b + 14** (widens 14's files in place). Targets `LayoutConfig` v1 only — unaffected by 17's v2 freeform mode. |

Dependency order in short: **11 → 12**, **13a → 13b → 14 → 19**, **13a → 13b → 17**, **13c before/alongside
14/19 & 17** (schema-adding sprints should use the tracked runner), **16 and 18 are independently
schedulable** (soft ordering notes only, not hard blocks), **15 never (yet)**.

## 7. Coding conventions

- Match the surrounding code's style, naming, and comment density. Read a neighboring file first.
- Pure helpers belong in `src/lib/*.ts`; keep them framework-free and unit-testable (that is why
  the tests import them directly).
- TypeScript: prefer explicit exported types the tests import.
- Python: **no ORM** — the repo uses asyncpg directly; follow `services/common/postgres_repository.py`
  patterns (explicit tenant context on every function).
- **No new dependencies** unless the spec explicitly calls for one. Known exception:
  **sprint-14 explicitly requires adding the `anthropic` Python SDK** to
  `requirements-backend.txt` — that one is expected. Nothing else.

## 8. When you finish

- Leave the working tree dirty (**uncommitted**). No git, full stop.
- Summarize: which files you changed, which gates you ran, and their **actual** output.
- Flag anything the spec didn't cover that required a judgment call — state the assumption
  and why, so the verifier and the user can catch it if wrong.
