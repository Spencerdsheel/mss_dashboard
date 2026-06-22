# Implementation Phases — Unified Remediation + Product Roadmap

Source inputs: `CODE_REVIEW.md` (senior 4-agent audit) ⊕ `updates/update.txt`
(hands-on testing notes + product direction).

**Headline (CORRECTED after live DB + code investigation).** The "shows
zero/null" symptoms are NOT "the REST path lagging the SampleDataProvider demo"
(my earlier theory) and have nothing to do with the Excel. The single source of
truth is the **mock API server `services/api/routes/client_api.py`**, which
imitates the live iSN API, was seeded once with the real 436 Brasserie Labatt
rows, then **generates** synthetic clients/visits. Ingestion pulls from it over
HTTP → transform → Postgres. Two confirmed runtime bugs:

- **Bug B — install all `"Pas cible"`:** `transform.py`'s `INSTALL1/2/3_MAP` keys
  are **English** (`"Yes, assembled in the B4 position"`, a dead-Excel leftover),
  but the server emits **French** answer text (`"Installe a la position B4"`). The
  `.get(french, "Pas cible")` lookup never matches → 100% default → donuts read
  0% success. (`transform.py:14-42,152-154`)
- **Bug A — Messi has 33,592 rows, not 436:** NOT duplication (PK
  `(tenant_id,project_id,survey_id)` enforced; all distinct). The mock mints ~5%
  new synthetic surveys every 5-min "generation"; long-running ingestion piled
  ~33k synthetic mutations on top of the real 436 — burying it.
- **Lesser:** backend stores unaccented French vs accented `constants.ts`;
  `formatDate` defaults to `fr-CA` → harmless "08 avr" (correct date, French).

### Decisions locked in
- **Excel is dead.** Remove `transform_local_dummy_db.py`, `local_fixtures.py`,
  and all `documentation/sample_raw_data` coupling from the live path.
- **No French, no "Shopmetrics" anywhere.** Full de-French of the dashboard —
  chrome AND data-value vocabulary — and rebrand to **iSN**. This supersedes the
  earlier "data values stay French" caveat: `constants.ts`, the mock generator,
  `transform.py`, `postgres_repository.py` success lists, `tests/seed-parity.test.ts`,
  and `.claude/rules/workbook-parity.md` move to one English vocabulary together.
- **Sequencing:** Phased — P1 bugs/parity → P2 security (DONE) → P3 features → P4 tests.
- **iSN rebrand:** rename `Shopmetrics`→`iSN` everywhere **and** add an
  admin-editable display-name field (new DB column + admin UI) so it is dynamic.

> **Status:** P1.1–P1.6 and all of P2 (S1–S9 + password-reset primitive) are
> implemented and uncommitted. **P2 is pending the user's manual testing — not
> signed off.** P1.4's runtime verification surfaced Bug A + Bug B, expanding P1.4
> into the seed/ingestion repair below.

---

## Verification of update.txt (verdict · evidence · disposition)

| # | update.txt point | Verdict | Evidence | Lands in |
|---|---|---|---|---|
| 1 | Login + admin in French | **CONFIRMED** | `login/login-form.tsx:43,59`, `login/page.tsx:52-54`, `admin/page.tsx:54,61`; `lib/utils.ts` defaults `fr-CA` | P3-i18n |
| 1b | "French components in overview" | **NUANCE** | Overview already uses English titles ("Project Overview","Visit List"); workbook FR labels (`Apercu du projet`…) largely gone. Full-English is consistent; update parity rule. | P3-i18n |
| 2 | Data refresh → 6 hours | **CONFIRMED (config)** | `services/ingestion/celery_app.py:43-50` env `SCHEDULED_REFRESH_INTERVAL_MINUTES` default 5 → set 360 | P1 |
| 3 | Shopmetrics → iSN, admin-dynamic | **PARTIAL** | hardcoded in `login/page.tsx`, `shopmetrics-provider.ts`, schema `kind='fake_shopmetrics'` (`dashboard_schema.sql:17,90`); no vendor display-name column/field | P3-rebrand |
| 4 | Remove "rest-api" wording on KPI cards | **CONFIRMED** | `dashboard/page.tsx:58-59` renders `{p.providerKind}` badge; set in `rest-api-provider.ts:151` | P1 |
| 5 | "To date" date range = garbage | **RESOLVED (was code bug; residual = locale)** | epoch-1970 `maxDate!` bug fixed in P1.2. Residual "08 avr" is the *correct* date (Apr 8) rendered in French — `formatDate` default `fr-CA` (`utils.ts:8`). Flip to `en-CA`. | P1.4 |
| 6 | KPI cards null/zero | **ROOT-CAUSED → Bug A/B** | active path `analytics.ts getProjectSummary`→`/projects/{id}/summary`; backend math is correct, but ingested data is wrong: Messi buried under ~33k synthetic rows (Bug A) and install=`Pas cible` (Bug B) | P1.4 |
| 7 | Pie/donut chart zero | **ROOT-CAUSED → Bug B** | `transform.py` English-keyed `INSTALL*_MAP` vs French server answers → 100% `Pas cible` → `donut-chart.tsx:30` `value>0` filter empties slices | P1.4 |
| 8 | Verify bar chart | **DATA EXISTS; re-verify post-reseed** | photos ARE generated (`STOREFRONT/PHOTO_1..9` present in DB); bar's "zero" is a casualty of Bug A bloat — confirm after clean re-ingest | P1.4 |
| 9 | Add more charts suitable for data | **FEATURE** | current: 3 donuts + 1 bar + counters + tables (no time-series/trend/geo) | P3-charts |
| 10 | Background too basic; subtle blurred animation | **CONFIRMED** | flat `--background:0 0% 94%` (`globals.css:8,38`), no motion | P3-design |
| 11a | Admin "fully dynamic / control everything" | **FEATURE** | admin is mostly read + limited writes | P3-admin |
| 11b | 1 tenant→N projects, active by date window | **PARTIAL** | schema already 1:N with `start_date/end_date` (`dashboard_schema.sql:18-19`, `models.py:52-53`); **not used** to filter visibility (`rbac.ts:76-88`) | P3-admin |
| 11c | Manage Users subpage / Run History subpage / password reset | **PARTIAL** | `/admin/users` exists; Run History only embedded (`run-log-list.tsx`); **no** password-reset flow anywhere | P2(reset-auth)/P3 |
| 11d | Cascading dependent filters | **NOT PRESENT** | `visits-table.tsx:43-46` precomputes all options from all rows, independent filters | P3-filters |

Plus all `CODE_REVIEW.md` audit items (A1–A3, S1–S9, C1–C10, T1–T6) carried forward.

---

## Phase 1 — Functional & parity bugs (user-visible first)

Goal: live dashboard renders real numbers, valid dates, English chrome, no
provider leakage; the red-line fallback is removed.

- **P1.1 `font-400`→`font-normal`** — `dashboard/page.tsx:21`,
  `[projectId]/page.tsx:42`, `visits/page.tsx:52`. (audit A1)
- **P1.2 Date-range bug** — guard null `maxDate`; never pass null to
  `formatDate`/`new Date`. `[projectId]/page.tsx:78-82`, harden `utils.ts:8-14`
  to return "—" on invalid/empty dates. (update #5, audit C10)
- **P1.3 Remove `rest-api` badge text** — drop/relabel provider badge in
  `dashboard/page.tsx:58-59` (no provider identifier in client UI). (update #4)
- **P1.4 (REVISED) — Per-project Campaign model + seed/ingestion repair (root
  cause for #6/#7/#8).** This grew from "fix labels" into the foundational
  multi-tenant data model. **Decision: Option B** — each project has its OWN
  campaign with a **variable number of install slots (1–4)**, distinct names,
  categories, targets; the dashboard renders install KPIs **dynamically**. Labatt
  becomes the first campaign (Messi/Flying Fish/Stock); the mock generates a
  distinct campaign per synthetic tenant. All vocabulary is **English**. Campaign
  config lives in **DB tables, seeded by the mock, admin-editable later (P3)**.
  *(Photo-provider wiring — `getVisit`/`listPhotos` + `visits/[surveyId]/page.tsx`,
  audit A2 — already DONE in P1 code.)*

  **a. Campaign-config schema** (`dashboard_schema.sql`, `services/common/models.py`):
  - `project_install_slots(tenant_id, project_id, slot_index 1..4, title, question,
    target NULLABLE)` — ordered, the per-campaign install KPIs.
  - `project_install_categories(tenant_id, project_id, slot_index, position, label,
    is_success)` — the answer options per slot + which count as success (replaces
    hardcoded `INSTALL*_SUCCESS_VALUES`).
  - Reuse the existing **photo-slot label** admin mechanism for per-project photo
    labels (do not duplicate it — verify what already exists first).
  - Storage of answers stays the existing fixed `visits.install1..install4` columns
    (cap = 4 matches the 1–4 bound; avoids an EAV refactor); a campaign with N<4
    slots simply leaves the rest unused.

  **b. Mock generates distinct campaigns** (`client_api.py`): deterministic per
  tenant — random-but-seeded slot count (1–4), themed product/display names, a
  question per slot, and a positioned **English** answer set per slot with marked
  success positions and *varied* success distributions (so dashboards differ).
  Emit matching `FormElements`/`FormQuestionAnswers`/`SurveyInstanceQuestionAnswers`.
  **Labatt stays its real, fixed 3-slot campaign at exactly 436** — the mock must
  NOT mint/mutate synthetic surveys for the Labatt project (fixes Bug A at source).

  **c. Transform — dynamic, no hardcoding** (`transform.py`): drop the English→French
  `INSTALL*_MAP` indirection (Bug B) and the hardcoded `standeeTarget`/`flyingFishTarget`
  metrics; map each form question → its `install{slot_index}` column by passing the
  server's answer text through (the form defines the category text). Seed the
  campaign-config tables from the form definition during ingestion.

  **d. Summary/API shape change** (`postgres_repository.get_project_summary`,
  `routes/projects.py`, `analytics.ts`): replace fixed `install1/2/3` fields with an
  ordered **list** `installSlots: [{slotIndex, title, target, successCount,
  distribution:[{label,value,isSuccess}]}]`. Success is derived from
  `project_install_categories.is_success`, not a hardcoded list. ⚠️ breaking
  response-shape change — update `analytics.ts` mapping + any tests.

  **e. Frontend renders N donuts dynamically** (`charts-section.tsx`,
  `[projectId]/page.tsx`): map over `installSlots` → one `DonutCard` per slot with
  **title/categories/target from config**; remove the hardcoded
  `"Standee Messi"`/`"Flying Fish Display"`/`"Stock / Supply"` titles. Grid handles
  1–4 donuts.

  **f. `constants.ts` / parity:** Labatt's `INSTALL*_COUNTS`/`SUCCESS_VALUES` become
  Labatt's seeded campaign config (English), not global constants; parity tests
  assert Labatt's 436 + its per-slot distributions against the config.

  **g. Remove the dead Excel path** — delete `transform_local_dummy_db.py`,
  `local_fixtures.py`, Excel coupling; move the load/upsert helper into a proper
  ingestion module (audit C9 de-dup).

  **h. Wipe + single controlled re-ingest** so Labatt/Messi = exactly 436 with real
  distributions and each synthetic tenant shows its own distinct campaign.

  **i. Locale flip** — `formatDate/formatDateTime/formatNumber` default
  `fr-CA`→`en-CA` (`utils.ts:8`) so "08 avr" → "Apr 08". (pulled fwd from P3-i18n)

  **j. Re-verify** per project: N donuts with real distributions + success %, photo
  bar with real coverage, real English date range; Labatt = 436; synthetic tenants
  show distinct campaigns. Do **not** mask any gap with the sample provider.
- **P1.5 Remove silent SampleDataProvider fallback** — `providers/index.ts:24-27`
  throw/redirect on missing token; `sample` only via explicit `DATA_PROVIDER`.
  (audit A3, red line)
- **P1.6 Refresh cadence → 6h** — set `SCHEDULED_REFRESH_INTERVAL_MINUTES=360`
  in env templates / compose; document. (update #2)

**Exit check:** log in as client → KPIs, donuts, bar show real values; date
range reads a real range; visit photos display; no "rest-api" text; missing
token → login (no sample data).

## Phase 2 — Security hardening (CODE_REVIEW Group B + reset-auth groundwork) — implemented, UNCOMMITTED · ⏳ pending user manual testing

- **S1** Dedicated `SECRET_ENCRYPTION_KEY` (not `jwt_secret`) in `settings.py`;
  use in `secrets.py`; prod guard; re-encrypt note. (`admin.py:139`,
  `client_api.py:599`)
- **S2** Rate limiter fail-**closed** for auth/admin; single shared instance;
  trusted `X-Forwarded-For`. (`rate_limiter.py:33-54,154`)
- **S3** Strip token/cookie/email logs (`providers/index.ts:21,29`,
  `rbac.ts:28-29,57-58`, `backend-auth.ts:19-31`); Sentry
  `send_default_pii=False` + scrub (`main.py:28`).
- **S4** Stop leaking `tenant_id`/`project_id` in client visit/photo JSON
  (`repository.py to_public_dict`, `models.py`, `routes/projects.py`).
- **S5** Env-driven CORS allowlist (`middleware.py:64-75`).
- **S6** Constant-time login (dummy verify on absent user)
  (`postgres_repository.py:113-127`).
- **S7/S8/S9** require `tenant_id` for CLIENT tokens (`security.py`); validate
  `role`/`tenant_id`/`project_ids` ownership on admin user writes
  (`admin.py:231-267`); cap mock-server token map (`client_api.py`).
- **Groundwork:** introduce a secure token-based **password-reset** primitive
  here (hashing, expiry, single-use) so the P3 reset UI sits on a sound auth
  base.

## Phase 3 — Product features (update.txt direction)

- **P3-i18n — Everything English.** Translate login + admin chrome and remaining
  French UI labels to English. (Locale default flip + the data-value vocabulary
  de-French happen in P1.4; this phase covers the remaining chrome/labels.) Update
  `.claude/rules/workbook-parity.md` to reflect the all-English decision. (update #1)
- **P3-rebrand — iSN, admin-editable.** Replace user-visible "Shopmetrics" with
  "iSN"; add a `display_name` column to `provider_connections`
  (`dashboard_schema.sql`), thread through `models.py ProviderConnection`,
  admin connection request/response models + endpoint (`admin.py:123-142`), and
  an admin UI field to edit it. Render the dynamic name where branding shows.
  (update #3)
- **P3-admin-structure.** Move Run History to its own subpage
  (`/admin/runs`) mirroring `/admin/users`; keep main admin as a hub. Add
  password-reset UI: a "Forgot password" flow on the login page and an admin
  "reset password" action in `/admin/users`. (update #11c)
- **P3-multi-project.** Use existing `start_date`/`end_date` to drive
  active-window visibility: `listVisibleProjects` (`rbac.ts:76-88`) and the
  projects list endpoint filter/flag projects by active date; dashboard groups
  projects per tenant and shows active vs past. (update #11b)
- **P3-dynamic-admin.** Make currently-static admin surfaces editable
  (campaign config from P1.4 — install-slot titles/questions/targets/categories &
  success flags, photo-slot labels, connection settings, project active windows)
  via admin endpoints + UI — scope to a concrete editable list, not literally
  "everything." Sits directly on the P1.4 campaign-config tables. (update #11a)
- **P3-cascading-filters.** Recompute each filter's options from rows already
  matching prior selections in `visits-table.tsx:43-46,190-200` (dependent
  dropdowns). (update #11d)
- **P3-charts.** Add data-appropriate visuals: visits-over-time trend line,
  cumulative success vs target, per-city/location breakdown — fed by the summary
  + visits data. (update #9)
- **P3-design.** Replace flat background with a subtle, low-opacity blurred
  gradient animation that does not reduce card/text contrast
  (`globals.css`, `app-shell.tsx:40`). (update #10)
- **Correctness/perf (audit Group C) folded in where adjacent:** C1 lateral join
  on full PK (`postgres_repository.py:316-329`); C2 `AND kind='client'` in
  `tasks.py:336-349`; C3 `visit_count` from `/projects` (kill N+1); C4 `/visits`
  pagination; C5 donut legend/`AnimatedCounter`/aria/casts/lint/`next.config.ts`
  CDN allowlist; C9 de-dup `refresh.py`/`tasks.py`.

## Phase 4 — Test backfill (mandatory rules; proves P1–P3)

- **T1** Real-Postgres tests for `postgres_repository.py` tenant-scoped methods;
  **two tenants** both containing survey `1737162`; assert no cross-tenant leak +
  per-tenant photo counts.
- **T2** FastAPI `TestClient` two-tenant isolation for `/visits`, `/summary`,
  `/visits/{id}`, `/photos`, admin gating — runs in normal `pytest`.
- **T3** Idempotency: run `load_transformed_dataset` twice; row counts stable.
- **T4/T5/T6** rate-limit thresholds; **campaign install success-semantics driven
  by `project_install_categories.is_success`** (per-project, variable slots) +
  Labatt 436 parity; `/api/v2/execute` + minimal frontend render tests (incl. the
  dynamic N-donut render). Add a parity test for the active-date visibility logic,
  distinct-synthetic-campaign generation, and cascading filters.

---

## Files most touched (by phase)

- **P1:** `src/app/dashboard/{page.tsx,projects/[projectId]/page.tsx,charts-section.tsx,.../visits/**}`,
  `src/lib/utils.ts` (locale), `src/lib/constants.ts` (→ Labatt campaign config),
  `src/server/providers/{index,rest-api-provider,types}.ts`, `src/server/analytics.ts`
  (installSlots shape), env/compose, `services/ingestion/celery_app.py`.
  **Campaign model (new):** `services/ingestion/dashboard_schema.sql`
  (`project_install_slots`/`project_install_categories`), `services/common/models.py`,
  `services/common/postgres_repository.py` (`get_project_summary` → installSlots),
  `services/api/routes/{projects,client_api}.py`, `services/ingestion/transform.py`
  (dynamic mapping, drop INSTALL*_MAP), + removal of `transform_local_dummy_db.py`
  & `local_fixtures.py`.
- **P2:** `services/common/{settings,secrets,security,repository,postgres_repository}.py`,
  `services/api/{main,middleware,rate_limiter}.py`,
  `services/api/routes/{admin,client_api,projects}.py`, frontend auth logging.
- **P3:** `src/app/{login,admin/**,dashboard/**}`, `src/components/**`,
  `src/lib/utils.ts`, `services/ingestion/dashboard_schema.sql`,
  `services/common/models.py`, `services/api/routes/admin.py`,
  `src/app/globals.css`, `.claude/rules/workbook-parity.md`, `next.config.ts`.
- **P4:** `backend_tests/**`, `tests/**`.

## Verification

1. `npx tsc --noEmit` clean; `npm run lint` 0 warnings.
2. `docker compose up -d` + wipe & single re-ingest + backend on 8010 + `npm run dev`:
   Labatt/Messi = exactly 436 with its real per-slot distributions; each synthetic
   tenant shows its OWN distinct campaign (variable 1–4 donuts, distinct titles);
   real KPIs/donuts/photo-bar, valid English date range, photos show, no provider
   badge; missing token → login (no sample).
3. Admin: Users and Run History are separate subpages; vendor name editable and
   reflected; password reset works; projects show per active date window;
   dependent filters narrow correctly.
4. `python -m pytest backend_tests -v` — new two-tenant/idempotency/repo tests
   pass against docker Postgres.
5. `graphify update .` after code changes.

## Commit grouping

One commit per phase boundary, sub-commits per item: P1 (bugs/parity) → P2
(security) → P3 (features, sub-grouped i18n / rebrand / admin / charts / design)
→ P4 (tests). Each independently reviewable and revertible.
