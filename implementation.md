# iSN Dashboard — Rebuild + Multi-Model Guardrail Workflow (Implementation Plan)

> **Status:** Part A + Part B **built** (guardrail layer, 14 KB skills, 4 hooks, settings,
> agents). Sprint 1 spec **written** and ready for Qwen. Next action: **run Qwen against
> `.claude/specs/sprint-01-frontend-unblock.md`**, then verify on Sonnet.
> **Author model:** Opus (planner). **Do not let agents `git add`/`commit`/`push`** — the
> user commits manually after testing each sprint (now enforced by `.claude/hooks/block-dangerous-git.sh`).
> **Conda env:** `venv` (`conda activate venv`).

---

## 1. Context / why

A git incident left this multi-tenant retail-execution dashboard non-buildable. The repo is a
**fresh clone with a single commit** (`2cd0f80 full project`), so **git reflog/stash/fsck
recovery is impossible** — the only dangling blobs are the `knowledge_base/*` docs + `utils.ts`.
Files that lived only in the original working tree were lost and must be **rebuilt from their
contracts** (existing tests in `tests/`, the importing files, and `updates/context.md` +
`updates/phase.md`, which fully document them).

The user also wants a durable way of working:
- **Opus** plans/designs and writes a `spec.md` per sprint.
- **Qwen 3.5** (run locally via **opencode**, outside Claude Code) implements from the specs.
- **Sonnet** verifies Qwen's output; **Sonnet/Haiku** make only small corrections.
- Hard guardrail: **agents never `git add`/`commit`/`push`**; user tests + commits each sprint.
- The user runs everything inside their **existing conda env** (name: _TBD — confirm before
  writing `conda-guard` + the guide_).
- The 14 `knowledge_base/` docs become **14 reusable skills** + a set of enforcement **hooks**.

**Outcome:** (1) dashboard builds and runs again; (2) a `.claude/` workflow layer encoding the
model-role guardrail, git lock, conda convention, KB skills, and a repeatable Opus→Qwen→Sonnet
sprint loop that drives the remaining roadmap.

---

## 2. The guardrail model (how every sprint runs)

```
Opus (Claude Code, planner)       → writes .claude/specs/sprint-NN-*.md  (design + rules + acceptance)
  └─ qwen_implementation_guide.md → standing instructions Qwen reads every sprint
        ↓  user runs opencode + Qwen locally against the spec
Qwen 3.5 (opencode, implementer)  → edits code per the spec; runs NO git
        ↓  user switches Claude Code to Sonnet
Sonnet (verifier)                 → diffs work vs spec + .claude/rules/*; runs tsc/lint/pytest
  └─ Sonnet/Haiku (fixer)         → apply small corrections only
        ↓
User manually tests → approves → USER (not agents) commits the sprint
```

- **Enforced by hook:** the git lock (block `add`/`commit`/`push`/`reset --hard`/`push --force`/
  `clean`/`branch -D`).
- **Enforced by convention + docs:** the model-role split. Claude Code cannot natively run Qwen,
  so the Opus→Qwen handoff is **file-based via `spec.md`** — that is *why* specs are the primary
  Opus deliverable. `qwen_implementation_guide.md` + `CLAUDE.md` carry the red lines so Qwen and
  every verifier inherit them.

---

## 3. What's broken (verified, concrete)

### 3a. Frontend — 4 missing files break `tsc` / `npm run dev`
Contracts already exist (tests + importers + `updates/context.md §5`):

| Missing file | Exports needed | Contract source |
|---|---|---|
| `src/lib/constants.ts` | `DEMO_ADMIN_EMAIL`, `DEMO_CLIENT_EMAIL`, `DEMO_PASSWORD`, `EXPECTED_VISIT_COUNT=436`, `EXTRA_SURVEY_ID="1737162"`, `INSTALL{1,2,3}_COUNTS`, `PHOTO_COUNTS`, `INSTALL{1,2,3}_SUCCESS_VALUES`, `STANDEE_TARGET=450`, `FLYING_FISH_TARGET=400`, `ROWS_WITH_NO_PHOTOS=3` | `tests/seed-parity.test.ts`, `src/app/login/page.tsx`, `src/server/providers/sample-*.ts` |
| `src/lib/chart-helpers.ts` | `buildTrendData()`, `installGridClass()` | `tests/chart-helpers.test.ts`, `.../charts-section.tsx` |
| `src/lib/projects.ts` | `isProjectActive()` | `tests/active-window.test.ts`, `src/app/dashboard/page.tsx` |
| `src/lib/cascading-filters.ts` | `rowsExcluding()` (imported as `cascadeRows`), `cascadingOptions()` | `tests/cascading-filters.test.ts`, `.../visits/visits-table.tsx` |

> Note: `src/lib/utils.ts` already exists. `utils.ts:8` still defaults locale `fr-CA` — flip to
> `en-CA` is part of P1.4 (roadmap), not the build-unblock.

### 3b. Backend / docs — referenced but absent
- `services/ingestion/{transform_local_dummy_db.py, local_fixtures.py, seed_local_dummy_db.py}`
  — **Excel-era, DEAD per `updates/phase.md`. Do NOT rebuild.** The reusable loader already
  lives in `services/ingestion/persistence.py` (`load_transformed_dataset()`), called live by
  `refresh.py` + `tasks.py`. **Action: correct `README.md`** to drop the dead commands.
- `backend_tests/` — missing; rebuild a minimal baseline so `pytest` runs (Sprint 2 / P4).
- `.claude/`, `CLAUDE.md`, `.claude/rules/*.md` — missing guardrail layer; built in Part A/B.
- `CODE_REVIEW.md` — historical audit; regenerate fresh via `/code-review` if wanted, don't
  reconstruct verbatim.
- Backend Python imports are otherwise clean; `dashboard_schema.sql`, `postgres_repository.py`,
  the mock API (`routes/client_api.py`), and the ingestion pipeline are intact.

---

## 4. Deliverables

### Part A — Workflow & guardrail infrastructure  *(Opus builds these directly — design artifacts)*
1. **`CLAUDE.md`** (project root) — orientation: stack map, the data-flow trace
   (browser → `src/server/analytics.ts getProjectSummary` → `/projects/{id}/summary` →
   `postgres_repository.get_project_summary`), and **red lines** (from `updates/context.md §10`):
   tenant_id only from verified JWT claims; every DB fn tenant-scoped; no silent sample fallback;
   httpOnly cookies; PBKDF2-SHA256 passwords; never log/commit secrets; thin REST handlers
   (no Shopmetrics HTTP imports in REST); transform never calls the API; idempotent ingestion.
2. **`.claude/rules/*.md`** — `tenant-isolation.md`, `service-boundary.md`, `api-boundary.md`,
   `sample-data.md`, `workbook-parity.md` (updated to the locked **all-English** decision).
3. **`qwen_implementation_guide.md`** (project root) — standing Qwen instructions: how to read a
   spec, the red lines, conda + run commands, the **no-git** rule, the verification gates
   (`npx tsc --noEmit` / `npm run lint` / `npm test` / `pytest backend_tests -v`), "leave commits
   to the user."
4. **`.claude/specs/SPEC_TEMPLATE.md`** + per-sprint specs (`sprint-01-*.md`, …): goal, exact
   files, function signatures, acceptance tests, red lines, verification commands.
5. **`.claude/settings.json`** — registers the hooks (Part B) + project permissions.
6. **`.claude/agents/`** *(optional)* — `verifier.md` (Sonnet remit) + `fixer.md` (Haiku remit)
   so the verify step is one launch.

### Part B — KB skills (14) + key hooks  *(Opus builds directly)*
**14 skills** in `.claude/skills/<name>/SKILL.md`, one per `knowledge_base/` file. Each: YAML
frontmatter (`name`, `description` = "Use when implementing/reviewing <area> in this dashboard")
+ the KB content reframed as actionable guidance. Names:

`system-design`, `backend-philosophy`, `api-services`, `frontend-architecture`,
`ui-design-system`, `data-pipeline`, `security-patterns`, `infrastructure`, `testing-strategy`,
`decision-records`, `backend-components-checklist`, `frontend-performance`, `rbac-model`,
`architecture-index` (from `00_INDEX.md`, points at the other 13).

**Key hooks** (`.claude/hooks/*` registered in `.claude/settings.json`):

| Hook | Type | Source | Behavior |
|---|---|---|---|
| `git-guardrail` | PreToolUse(Bash) | user requirement | Block `git add/commit/push/reset --hard/clean/branch -D/push --force`; exit non-zero, message that commits are the user's job. |
| `conda-guard` | PreToolUse(Bash) | `08_INFRASTRUCTURE` | Warn/block when `python/pip/pytest/uvicorn/celery` run outside the conda env (`CONDA_DEFAULT_ENV` unset or `base`). |
| `secret-pii-guard` | PreToolUse(Edit/Write) | `07_SECURITY_PATTERNS`, `RBAC_MODEL` | Flag edits that log tokens/passwords/emails or accept `tenant_id` from request input. |
| `verification-reminder` | Stop | `09_TESTING_STRATEGY` | Remind to run the tsc/lint/test gates before declaring done. |

> Confirm the conda env name before writing `conda-guard` + the guide.

### Part C — Rebuild sprints  *(each: Opus spec → Qwen impl → Sonnet verify → user tests/commits)*
- **Sprint 1 — Frontend builds & runs again.** Rebuild the 4 `src/lib/*.ts` files TDD-style
  against `tests/{seed-parity,chart-helpers,active-window,cascading-filters}.test.ts` (tests
  already define the contracts). Correct `README.md` dead Excel commands.
  **Exit:** `npx tsc --noEmit` clean, `npm run lint` clean, `npm test` green, `npm run dev`
  renders login + dashboard with no missing-module errors.
- **Sprint 2 — Backend runs end-to-end.** `conda activate <env>` → `docker compose up -d` →
  schema applies → `uvicorn services.api.main:app --port 8010` → one manual ingest from the mock
  API → API serves `/projects`, `/summary`, `/visits`. Stand up minimal `backend_tests/` baseline.
  **Exit:** `/healthz` + `/readyz` OK, one clean ingest, API returns Labatt/Messi data, `pytest`
  runs.
- **Roadmap backlog (same loop, one spec each)** — from `updates/phase.md`:
  - **P1.4** — per-project **campaign model** (variable 1–4 install slots in DB tables), fix
    **Bug B** (drop English-keyed `INSTALL*_MAP` in `transform.py`; pass form answer text through),
    fix **Bug A** (mock must not mint synthetic surveys for the real Labatt project), locale flip
    `fr-CA`→`en-CA`, then **wipe `dashboard.visits`/`visit_photos` + single controlled re-ingest**
    (Labatt/Messi = exactly **436**).
  - **P3** — de-French/i18n, Shopmetrics→**iSN** rebrand (admin-editable `display_name`), admin
    structure (Users/Run History subpages, password-reset UI), multi-project active-window
    visibility, cascading filters, more charts, animated background.
  - **P4** — two-tenant isolation tests, idempotency tests, config-driven campaign-success tests,
    Labatt 436 parity.

---

## 5. Execution protocol (per sprint)
1. **Opus** writes `.claude/specs/sprint-NN-<topic>.md`.
2. **User** runs Qwen via opencode against the spec (Qwen edits code, no git).
3. **User** switches Claude Code to **Sonnet**; launches `verifier` to diff vs spec +
   `.claude/rules/*` and run the gates; reports pass/fail.
4. **Sonnet/Haiku** apply only small flagged corrections.
5. **User** manually tests, then commits. **Agents never commit.**

---

## 6. Verification
- **Workflow layer:** an agent `git commit` is blocked by `git-guardrail`; the 14 skills load via
  the Skill tool; skills + 4 hooks present in `.claude/settings.json`.
- **Sprint 1:** `npx tsc --noEmit` + `npm run lint` clean; `npm test` all green; `npm run dev`
  serves `http://localhost:3000`.
- **Sprint 2:** `docker compose up -d`; `curl http://localhost:8010/healthz` + `/readyz` OK; one
  ingest; `GET /projects/{messi}/summary` returns data; `pytest backend_tests -v` runs.
- **Roadmap exit (later):** per `updates/phase.md` — Labatt/Messi = exactly 436 with real per-slot
  distributions; each synthetic tenant a distinct campaign; English dates; no provider badge;
  missing token → login (no sample fallback).

---

## 7. Critical files
- **Build directly (Opus):** `CLAUDE.md`, `qwen_implementation_guide.md`,
  `.claude/{settings.json, rules/*.md, skills/*/SKILL.md, hooks/*, agents/*, specs/*}`.
- **Rebuild via spec (Qwen):** `src/lib/{constants,chart-helpers,projects,cascading-filters}.ts`;
  later `backend_tests/**` + the P1.4/P3 sources in `updates/phase.md` "Files most touched".
- **Correct, don't rebuild:** `README.md` (drop dead `seed_local_dummy_db` /
  `transform_local_dummy_db` commands). Reuse intact `services/ingestion/persistence.py`.
- **Contract sources (read-only, drive the specs):** `tests/*.test.ts`, `updates/context.md`,
  `updates/phase.md`, `knowledge_base/*`.

---

## 8. Sprints 03–07 — Production readiness & core architecture (2026-06-24)

> **Context file for Qwen:** `updates/sprint-03-07-context.md`

### Sprint 03 — Login page cleanup
**Spec:** `.claude/specs/sprint-03-login-page-cleanup.md`
Remove all demo/prototype branding. "Prototype Dashboard" → "iSN Dashboard", remove demo
accounts box, clear input placeholders, add iSN logo. Pure frontend, no backend changes.
**Exit:** Login page shows "iSN Dashboard" branding, no demo references.

### Sprint 04 — Home page fixes
**Spec:** `.claude/specs/sprint-04-home-page-fixes.md`
(a) "Past / Upcoming" → "Ongoing Projects". (b) Visit count badges → "Live"/"Completed".
(c) Date filter bar (client-side filtering by project date overlap). (d) Dynamic header title
from new `dashboard.platform_settings` table + admin settings page.
**Exit:** Home page is filterable, header title is admin-editable, badges show live status.

### Sprint 05 — Admin bug fixes
**Spec:** `.claude/specs/sprint-05-admin-bug-fixes.md`
(a) Fix project update losing `visit_count` (missing from RETURNING clause in
`postgres_repository.py`). (b) Add `client_name` editing to Projects admin page + clarifying
note on Connections page. (c) Add empty-state message to metrics sidebar.
**Exit:** Project edits preserve visit count, client_name editable, no blank UI states.

### Sprint 06 — Project page visual fixes
**Spec:** `.claude/specs/sprint-06-project-page-visuals.md`
(a) Normalize KPI card heights (Execution Period card). (b) Cap pie chart grid at 2 columns.
(c) Verify chart data (P3 empty, Visits over Time representation). (d) Gap-fill trend chart
if needed.
**Exit:** Uniform card heights, readable pie charts, graceful empty states.

### Sprint 07 — Three-tier role system (MAJOR)
**Spec:** `.claude/specs/sprint-07-three-tier-roles-design.md`
Introduce PLATFORM_ADMIN / CLIENT_ADMIN / TENANT_USER. New `companies` table grouping tenants.
JWT claims extended with `company_id`. Repository queries scoped by role tier. Frontend RBAC
updated. Migration script for existing users.
**Exit:** All three roles work end-to-end with proper isolation.

### Roadmap beyond Sprint 07
- **Sprint 08+** — Plug-and-play API pipeline (abstract provider adapters)
- **Sprint 09+** — Dynamic chart/visual builder (admin-created charts)
- These need separate design specs written by Opus before implementation.

---

## 8. Open items
- [x] Conda env **name** = `venv` (wired into `conda-guard.sh`, `CLAUDE.md`, the guide).
- [x] Skills location = project `.claude/skills/` (14 built, one per KB file).
- [x] Decided: do **not** rebuild dead Excel files; `README.md` correction folded into Sprint 1 spec.
- [ ] Confirm Labatt English campaign labels at P1.4 time (`updates/context.md §8`) — still pending, P1.4.

## 9. What's built vs. what's next

**Built (Opus, this layer):**
- `CLAUDE.md`, `qwen_implementation_guide.md`.
- `.claude/rules/` — 5 rules. `.claude/skills/` — 14 KB skills. `.claude/agents/` — verifier (Sonnet) + fixer (Haiku).
- `.claude/hooks/` — git-guardrail, conda-guard, secret-pii-guard, verification-reminder (all tested) + `.claude/settings.json`.
- `.claude/specs/SPEC_TEMPLATE.md` + `.claude/specs/sprint-01-frontend-unblock.md`.

**Next (resume here):**
1. Run **Qwen** (opencode) against `.claude/specs/sprint-01-frontend-unblock.md` → it rebuilds the
   4 `src/lib/*.ts` files + corrects `README.md`.
2. Switch Claude Code to **Sonnet**; launch the `verifier` agent → runs `tsc`/`lint`/`npm test`,
   checks against spec + rules; `fixer` (Haiku) for small corrections.
3. **You** manually test (`npm run dev`) and commit Sprint 1.
4. Write **Sprint 2** spec (backend end-to-end + `backend_tests/` baseline), then the P1.4/P3/P4
   backlog — one spec at a time.
