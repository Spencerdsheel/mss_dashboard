# Implementation Context — Everything an Agent Needs to Build P1.4 (and beyond)

> **Purpose.** This is a cold-start briefing. If you are an implementing agent who
> was *not* part of the investigation, read this top to bottom before touching
> code. It captures the architecture, the confirmed root causes (with file:line),
> the data-flow traces, the mock-server + ingestion internals, the agreed design,
> what is already done, and the hard constraints. The phased roadmap lives in
> `updates/phase.md`; the original audit in `CODE_REVIEW.md`; the canonical project
> rules in `CLAUDE.md` and `.claude/rules/*.md`. **Those rules OVERRIDE anything
> here if they conflict.**

---

## 0. TL;DR — what you are building

The dashboard charts (install donuts, photo bar) render zero, and dates render in
French. Investigation proved this is **not** a frontend bug and **not** an Excel
problem. Root causes:

- **Bug B** — install values are 100% `"Pas cible"` (default) because
  `services/ingestion/transform.py` maps answers through an **English-keyed**
  dictionary, but the mock API server emits **French** answer text. Lookup misses →
  default. Donuts therefore show 0% success.
- **Bug A** — the real Labatt/Messi project has **33,592 rows instead of 436** (not
  duplication — the mock mints new synthetic surveys every "generation" and
  long-running ingestion accumulated ~33k synthetic mutations on top of the real
  436). The real data is *buried*.
- **Locale** — `formatDate` defaults to `fr-CA`, so the (correct) date Apr 8 renders
  as "08 avr".

The agreed fix (Option B) is bigger than patching these: build a **per-project
campaign model** so each project (tenant) has its own campaign with a *variable*
number of install slots (1–4), its own labels/categories/targets, rendered
dynamically. Labatt becomes the first campaign; the mock generates a distinct
campaign per synthetic tenant. See §8 for the full design.

---

## 1. Stack & services

- **Frontend:** Next.js 15 App Router, React 19, TypeScript, Tailwind. Under `src/`.
- **Backend:** Python FastAPI under `services/`:
  - `services/common` — settings, security (JWT/PBKDF2), AES secrets, tenancy,
    domain models, DB repositories (`postgres_repository.py` is the production one).
  - `services/api` — REST endpoints, middleware, rate limiter, **and the mock iSN
    API** (`routes/client_api.py`).
  - `services/ingestion` — pulls from the mock iSN API, transforms, loads Postgres.
- **DB:** PostgreSQL 16, schema `dashboard.*`.
- **Cache:** Redis (rate limiting).
- **Knowledge graph:** `graphify-out/`. Run `graphify query "<q>"` /
  `graphify explain "<concept>"` to orient before reading source; run
  `graphify update .` after code changes.

### Data flow (critical to understand)
```
Browser → Next.js page (server component)
  → src/server/analytics.ts  getProjectSummary(projectId, token)
     → backendGet('/projects/{id}/summary')            ← THE ACTIVE KPI/CHART PATH
        → services/api/routes/projects.py
           → services/common/postgres_repository.py  get_project_summary()
              → SELECT ... FROM dashboard.visits / dashboard.visit_photos
```
**Note:** KPIs/charts do NOT flow through `RestApiProvider`. The provider
(`src/server/providers/rest-api-provider.ts`) is only used for `listProjects`,
`getVisit`, `listPhotos`, and a cosmetic `describeProject`. Do not "fix" charts in
the provider — fix the data in Postgres + the summary endpoint + `analytics.ts`.

The data enters Postgres via ingestion:
```
services/ingestion/refresh.py  run_manual_refresh()
  → services/ingestion/client.py  ShopmetricsClient (OAuth /oauth/connect/token, query /api/v2/execute)
  → services/ingestion/extractor.py  ShopmetricsExtractor.pull()  → rowsets
  → services/ingestion/transform.py  transform_shopmetrics_rowsets()  → DashboardVisit/Photo
  → services/ingestion/transform_local_dummy_db.py  load_transformed_dataset()/upsert_visits()  → Postgres
     (this load module is Excel-era; per the plan its load/upsert helper moves to a
      proper ingestion module and the Excel parts are deleted — see §7)
```

---

## 2. Environment, ports, commands

From `.env` (dev):
```
APP_ENV=development
BACKEND_REPOSITORY=postgres
BACKEND_API_URL=http://localhost:8010
DATABASE_URL=postgresql://postgres:admin@localhost:5433/shopmetrics_demo
REDIS_URL=redis://localhost:6380/0
DATA_PROVIDER=rest-api
JWT_SECRET=dev-secret-change-me-in-production
CORS_ALLOWED_ORIGINS=http://localhost:3000
```
Postgres is on **port 5433** (not 5432), db `shopmetrics_demo`, user `postgres`,
password `admin`. The API server runs on **8010**. Frontend on **3000**.

**Phase 2 added env vars** (dev defaults exist; required in prod): `SECRET_ENCRYPTION_KEY`
(≥32 chars, must differ from `JWT_SECRET`), `CORS_ALLOWED_ORIGINS`, `TRUSTED_PROXY_COUNT`
(default 0), `JWT_AUDIENCE` (optional), `CLIENT_API_MAX_TOKENS` (default 1000).

Common commands:
```bash
docker compose up -d                                  # Postgres + Redis
python -m services.ingestion.runner --tenant demo     # ingestion (manual)  [verify entrypoint]
uvicorn services.api.main:app --reload --port 8010    # API + mock iSN server
npm run dev                                            # frontend
python -m pytest backend_tests -v                      # backend tests
npx tsc --noEmit && npm run lint                       # frontend gates
graphify update .                                      # refresh the knowledge graph
```
Read-only DB diagnostic (psycopg is installed):
```bash
python -c "import psycopg; c=psycopg.connect('postgresql://postgres:admin@localhost:5433/shopmetrics_demo'); cur=c.cursor(); cur.execute('select count(*) from dashboard.visits'); print(cur.fetchone())"
```

---

## 3. Ground-truth DB state (as investigated)

```
distinct tenants = 11, distinct projects = 11 (1:1), total visits = 891,892
per-project: tenant_test_01..10 each ~80k–93k; tenant_labatt/project_messi_flying_fish = 33,592
Messi: 33,592 rows = 33,592 DISTINCT survey_ids (top ones are synthetic 9057131, 9074152, …)
install1 across ALL rows = 'Pas cible' (100%); same within Messi
photos EXIST: STOREFRONT/PHOTO_1/PHOTO_2 ≈ 791,612 each, PHOTO_3..9 decreasing
PK (tenant_id, project_id, survey_id) IS enforced (unique index visits_pkey)
```
Interpretation: PK works (no true duplication); 33,592 = generator accumulation.
Expected Labatt baseline: **436 visits**, survey `1737162` must be present, date
range `2026-03-06`→`2026-04-08`.

---

## 4. The two bugs — exact root cause

### Bug B — install all `"Pas cible"`  (`services/ingestion/transform.py`)
- Lines **14–42**: `INSTALL1_MAP` / `INSTALL2_MAP` / `INSTALL3_MAP` have **English
  keys** (e.g. `"Yes, assembled in the B4 position": "Installe a la position B4"`).
  These keys are a leftover from the dead Excel (its columns were English).
- Lines **152–154**: `install1=INSTALL1_MAP.get(answer_or_comment(...), "Pas cible")`.
- The mock server emits **French** answer text (`"Installe a la position B4"`), so
  the resolved answer is never an English key → every call returns `"Pas cible"`.
- Resolution chain inside transform:
  - `build_answer_text_lookup(form_question_answers)` → `(QuestionID, Position) → Text`
    (lines 168–179).
  - `build_instance_answer_lookup(survey_instance_question_answers, answer_text)` →
    `(InstanceID, ProtoQuestionID) → Text` (lines 182–197).
  - `answer_or_comment(survey_id, QUESTION_IDS[...], instance_answers, question_comments)`.
- `QUESTION_IDS` (from `services/ingestion/local_fixtures.py`): `clerk=88701`,
  `install1=88702`, `install2=88703`, `install3=88704`, `overall_notes=88705`.
- **Fix direction:** drop the English→French remap entirely; the form already
  defines the canonical category text, so pass the resolved answer text straight
  into the `install{n}` column. Vocabulary becomes English end-to-end (the mock will
  emit English categories — see §8).

### Bug A — Messi bloated to 33,592  (`services/api/routes/client_api.py` generation)
- NOT duplication. The mock generates synthetic surveys per "generation":
  ~85% unchanged baseline survey_ids, ~10% mutated, **~5% brand-new** synthetic IDs
  `9000000 + generation*1000 + j`. A new generation advances every
  `GENERATION_INTERVAL_SECONDS` (default 300s = 5 min). Long-running / repeated
  ingestion accumulated ~33k synthetic surveys onto the Labatt project.
- **Fix direction:** the mock must NOT mint/mutate synthetic surveys for the **real
  Labatt project** — keep it a stable 436. Synthetic volume belongs only to the
  synthetic test tenants. Then **wipe `dashboard.visits`/`visit_photos` and do a
  single controlled re-ingest**.

### Locale — French dates  (`src/lib/utils.ts`)
- Line **8**: `formatDate(d, locale = "fr-CA")` → "08 avr". Also `formatDateTime`
  (~line 19) and `formatNumber` (~line 37). **Fix:** default `en-CA`. (Phase 1
  already added the null/invalid guard returning `"—"`.)

---

## 5. Frontend file map (what each does)

- `src/app/dashboard/page.tsx` — project list (cards). Uses `listVisibleProjects()`
  (`src/server/rbac.ts`). Card dates come from project metadata `startDate/endDate`
  (provider `listProjects`), NOT visit min/max. Phase 1 already fixed the badge and
  date guards here.
- `src/app/dashboard/projects/[projectId]/page.tsx` — project detail. Line ~24
  `getProjectSummary(projectId, token)`; lines ~78–80 build the date range from
  `summary.minDate`/`maxDate`; renders `<ChartsSection .../>`.
- `src/app/dashboard/projects/[projectId]/charts-section.tsx` —
  - lines **39–52**: `photoData` from `photoByKind["STOREFRONT"]`, `["PHOTO_1"]`…`["PHOTO_9"]`.
  - lines **62–88**: three `DonutCard`s with **hardcoded titles** `"Install 1 — Standee
    Messi"`, `"Install 2 — Flying Fish Display"`, `"Install 3 — Stock / Supply"`,
    fed `install1/install2/install3` + `install{n}Success`. **These titles must
    become per-project/dynamic.**
  - lines **113–115**: `<PhotoBarChart data={photoData} />`.
- `src/components/charts/donut-chart.tsx` — line **30** filters `data.filter(d => d.value > 0)`;
  empty/zero arrays → no slices.
- `src/server/analytics.ts` — `getProjectSummary` (lines 10–45). Fetches
  `/projects/{id}/summary`, maps snake_case→camelCase: `minDate`, `maxDate`,
  `install1/2/3`, `install{n}Success`, `photoByKind`, `rowsWithNoPhotos`, `metrics`.
  **This mapping must change to an `installSlots` list (breaking shape) — see §8.**
- `src/lib/constants.ts` — `EXPECTED_VISIT_COUNT=436`, `EXTRA_SURVEY_ID="1737162"`,
  `INSTALL1/2/3_COUNTS` (accented French labels + counts), `PHOTO_COUNTS`,
  `INSTALL1/2/3_SUCCESS_VALUES` (accented French), `STANDEE_TARGET=450`,
  `FLYING_FISH_TARGET=400`, `ROWS_WITH_NO_PHOTOS=3`. **These become Labatt's seeded
  campaign config (English), not global constants.**
- `src/server/providers/{index,rest-api-provider,types}.ts` — provider factory +
  REST provider. Phase 1: removed silent sample fallback (`index.ts`), added
  `getVisit`/`listPhotos` and photo mapping (`rest-api-provider.ts` + `types.ts`).

---

## 6. The mock iSN server — `services/api/routes/client_api.py`

- Endpoints: `POST /oauth/connect/token` and `POST /api/v2/execute`.
- Question IDs (lines ~60–66): clerk 88701, install1 88702, install2 88703,
  install3 88704, overall_notes 88705.
- Answer lists (lines ~68–101): `INSTALL1_ANSWERS`, `INSTALL2_ANSWERS`,
  `INSTALL3_ANSWERS` — **French, unaccented** (e.g. `"Installe a la position B4"`,
  `"Entierement rempli"`, `"Pas cible"`). `PHOTO_KINDS` = STOREFRONT, PHOTO_1..9.
- `RESOURCE_GENERATORS` (~526–539) maps Shopmetrics resources to `_generate_*`:
  Clients, Forms, Locations, ClientProperties, LocationPropertyValues, FormElements,
  **FormQuestionAnswers** (`(QuestionID, Position) → Text`), SurveyInstances,
  SurveyInstanceQuestions, **SurveyInstanceQuestionAnswers** (returns `AnswerPos`,
  position only), SurveyInstanceLocationProperties, **SurveyInstanceAttachments**
  (photos: 3–7 per survey, kinds cycle PHOTO_KINDS).
- Generation: deterministic mulberry32 seed = `md5(tenant_id)[:8] + generation*1000`;
  baseline loaded once from DB into in-memory `TENANT_STATES`; `ACCESS_TOKENS`
  in-memory (Phase 2 S9 capped it). Generation advances every
  `GENERATION_INTERVAL_SECONDS` (default 300). Synthetic new IDs `9000000 + gen*1000 + j`.
- **For the campaign model you will change this file** to generate a distinct
  campaign per synthetic tenant (variable slot count, English category sets, varied
  distributions) and to keep the Labatt project fixed (no synthetic minting).

---

## 7. Ingestion internals & the Excel removal

- Entry: `services/ingestion/refresh.py` `run_manual_refresh()` (also a Celery
  `tasks.py` twin — audit C2/C9 note drift; de-dup when touching).
- `services/ingestion/client.py` — `ShopmetricsClient`, `ShopmetricsCredentials`
  (`token_url=/oauth/connect/token`, `execute_url=/api/v2/execute`), `HttpxTransport`.
- `services/ingestion/extractor.py` — `ShopmetricsExtractor.pull()` returns rowsets.
- `services/ingestion/transform.py` — `transform_shopmetrics_rowsets()` (line 118);
  `DashboardVisit`/`DashboardPhoto`/`DashboardMetric` dataclasses; lines **162–163**
  hardcode `standeeTarget=450`/`flyingFishTarget=400` metrics for **every** tenant
  (must become per-project).
- `services/ingestion/transform_local_dummy_db.py` + `services/ingestion/local_fixtures.py`
  — **Excel-era. To be removed.** They read `documentation/sample_raw_data/*.xlsx`.
  The reusable bit is `upsert_visits()` / `replace_photos()` / `load_transformed_dataset()`
  (ON CONFLICT on `(tenant_id, project_id, survey_id)` — correct) — **move these into
  a proper ingestion/persistence module** before deleting the Excel parts. Remove all
  `documentation/sample_raw_data` coupling from the live path.

### Schema — `services/ingestion/dashboard_schema.sql`
- `dashboard.visits`: PK `(tenant_id, project_id, survey_id)` (line ~53); columns
  include `install1..install4 TEXT`, `visit_date`, `visit_time`, `store_id`,
  `store_name`, `address`, `city`, `clerk_name`, `overall_notes`, `updated_at`.
- `dashboard.visit_photos`: `(tenant_id, project_id, survey_id, kind, url, caption)`.
- `dashboard.projects`: 1:N with tenants, has `start_date`/`end_date`.
- `get_project_summary` in `postgres_repository.py` (~lines 186–324) uses CTEs:
  `visit_stats` (count, min/max date), `photo_stats` (count by kind), and
  `install_distributions` (`GROUP BY install1, install2, install3`). Returns a
  `ProjectSummary` dataclass; serialized by `to_public_dict` /
  `to_client_visit_dict` (Phase 2 S4 added the client variant that strips
  tenant_id/project_id for client-facing visit/photo JSON).

---

## 8. The campaign model to build (Option B — DECIDED)

Each project owns a campaign with a **variable number of install slots (1–4)**.
Install labels, categories, success rules, and targets are **per-project data**,
not global constants. Dashboard renders install KPIs **dynamically**. Mock
generates a **distinct campaign per synthetic tenant**; Labatt is the first
campaign (fixed, 436). All vocabulary **English**.

**a. Schema (new tables in `dashboard_schema.sql`, models in `services/common/models.py`):**
- `dashboard.project_install_slots(tenant_id, project_id, slot_index 1..4, title,
  question, target NULLABLE, PRIMARY KEY (tenant_id, project_id, slot_index),
  FK → projects)`.
- `dashboard.project_install_categories(tenant_id, project_id, slot_index, position,
  label, is_success BOOL, PRIMARY KEY (tenant_id, project_id, slot_index, position))`.
- Photo-slot labels: **reuse the existing photo-slot label admin mechanism**
  (CLAUDE.md references admin photo-slot label management — verify what already
  exists before adding anything; do not duplicate).
- Answers keep the existing fixed `visits.install1..install4` columns (matches the
  1–4 cap; no EAV refactor). A campaign with N<4 slots leaves the rest unused.

**b. Mock (`client_api.py`):** deterministically per tenant — choose slot count
(1–4), themed product/display names, a question per slot, a positioned **English**
answer set per slot with marked success positions, and *varied* success
distributions so dashboards differ. Emit matching FormElements/FormQuestionAnswers/
SurveyInstanceQuestionAnswers. **Labatt = fixed real 3-slot campaign at exactly
436; never mint synthetic surveys for it.**

**c. Transform (`transform.py`):** delete `INSTALL*_MAP` and the hardcoded
target metrics; map each form question → `install{slot_index}` by passing the
form's answer text through; seed `project_install_slots` / `project_install_categories`
from the form definition during ingestion.

**d. Summary/API (BREAKING SHAPE):** `get_project_summary` → return an ordered list
`installSlots: [{slotIndex, title, target, successCount, distribution:[{label, value,
isSuccess}]}]`. Success derived from `project_install_categories.is_success`. Update
`routes/projects.py` and `src/server/analytics.ts` mapping; update any test that
reads `install1/2/3`.

**e. Frontend (`charts-section.tsx`, `[projectId]/page.tsx`):** map over
`installSlots` → one `DonutCard` per slot with **title/categories/target from
config**; remove the hardcoded titles; grid handles 1–4 donuts.

**f. `constants.ts` / parity:** Labatt's `INSTALL*_COUNTS`/`SUCCESS_VALUES` become
Labatt's seeded English campaign config; parity tests assert Labatt 436 + per-slot
distributions against the config (update `tests/seed-parity.test.ts` and
`.claude/rules/workbook-parity.md`).

**g/h/i/j.** Remove Excel path (§7); wipe + single re-ingest; flip locale to
`en-CA`; re-verify per project (N donuts with real distributions + success %, photo
bar with real coverage, real English date range; Labatt = 436; synthetic tenants
distinct). **Never mask gaps with the sample provider.**

> English campaign labels (e.g. Labatt: "Standee Messi", "Flying Fish Display",
> "Stock / Supply"; categories like "Installed in B4 position", "Installed
> elsewhere", "Assembled in backroom", "Given to an employee", "Refused", "Store
> closed", "Not targeted") should be confirmed with the user during implementation.

### Domain meaning (so labels make sense)
"Messi and Flying Fish" is a real **Brasserie Labatt** point-of-sale campaign in
Couche-Tard stores (Quebec). Install 1 = a **Messi standee** (cardboard display) at
store position **B4**; Install 2 = a **Flying Fish présentoir** (display stand) at
position **360**; Install 3 = whether the display was **stocked**. These are
Labatt-specific — other tenants must get their own distinct campaigns.

---

## 9. Already done (uncommitted in working tree)

**Phase 1 (P1.1–P1.6):** `font-400`→`font-normal`; date null-guards in `utils.ts` +
detail page; removed the leaked `rest-api` provider badge; wired visit photos via
provider `getVisit`/`listPhotos` (+ `types.ts` + detail page); removed silent
`SampleDataProvider` fallback (`providers/index.ts` now throws on missing token);
refresh cadence → 360 min (+ fixed a prod env-var name mismatch
`SCHEDULED_REFRESH_INTERVAL_HOURS`→`_MINUTES`). tsc clean, lint unchanged.

**Phase 2 (S1–S9 + reset primitive) — IMPLEMENTED, NOT YET USER-TESTED:** dedicated
`SECRET_ENCRYPTION_KEY` (key separation from `jwt_secret`; **breaking: existing
encrypted secrets need re-encryption**); rate limiter fail-closed for auth/admin +
`X-Forwarded-For` via `TRUSTED_PROXY_COUNT`; stripped token/cookie/email logs +
Sentry `send_default_pii=False`; client-facing JSON no longer leaks
`tenant_id`/`project_id` (`to_client_visit_dict`); env-driven CORS; constant-time
login; JWT requires `tenant_id` for CLIENT + optional `aud`; admin user-write
validation; capped mock token map; password-reset primitive (hashed, single-use,
expiring) + `password_reset_tokens` table. pytest 56 passed / 18 skipped / 0 failed.

**Nothing is committed.** Plan: one commit per phase boundary; do not commit until
asked.

---

## 10. Red lines (from CLAUDE.md — non-negotiable)

- Do not weaken tenant isolation. `tenant_id` comes ONLY from verified JWT claims —
  never from query strings, bodies, route params, or headers.
- Every DB-layer function requires tenant context. Two-tenant isolation tests for
  any tenant-scoped route/DB function.
- Do not expose fake live-sync UI before refresh is wired to the backend.
- Do not silently fall back to sample data on API errors.
- Photos: store/return CDN URLs only — never proxy image bytes.
- httpOnly cookies for tokens (never localStorage); PBKDF2-SHA256 for passwords.
- Never commit/log/return iSN/Shopmetrics secrets or live credentials.
- REST handlers stay thin; Shopmetrics HTTP code must not be imported by REST
  handlers; transform receives rowsets + tenant context, never calls the API.
- Ingestion must be idempotent: re-running the same input must not duplicate rows.

---

## 11. Verification (end-to-end)

1. `npx tsc --noEmit` clean; `npm run lint` no new warnings (one pre-existing:
   `src/components/admin/run-log-list.tsx:29:6` exhaustive-deps).
2. `docker compose up -d` → **wipe `dashboard.visits`/`visit_photos`** → single
   re-ingest → API on 8010 → `npm run dev`. Then log in as client and confirm:
   Labatt/Messi = exactly **436** with real per-slot install distributions; each
   synthetic tenant shows its **own distinct campaign** (variable 1–4 donuts, distinct
   titles); donuts show real success %; photo bar shows real coverage; date range is
   a real **English** range; no provider badge; missing token → login (no sample).
3. `python -m pytest backend_tests -v` — campaign success-semantics (config-driven),
   Labatt 436 parity, two-tenant isolation, idempotency.
4. `graphify update .` after code changes.

Demo / parity facts: Labatt client "Brasserie Labatt", project "Messi and Flying
Fish", 436 visits, dates 2026-03-06→2026-04-08, survey `1737162` must be present.

---

## 12. Pointers

- `updates/phase.md` — the phased roadmap (P1–P4); P1.4 sub-items (a)–(j) are the
  authoritative task list for this work.
- `CODE_REVIEW.md` — the original audit (A1–A3, S1–S9, C1–C10, T1–T6).
- `updates/update.txt` — the user's raw testing notes (source of the feature list).
- `CLAUDE.md` + `.claude/rules/*.md` — canonical rules (tenant isolation, service
  boundary, API boundary, sample-data, workbook-parity). These OVERRIDE this doc.
