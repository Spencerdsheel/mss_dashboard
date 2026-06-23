# Sprint 01 — Make the frontend build & run again

> **Author:** Opus (planner). **Implementer:** Qwen 3.5 via opencode. **Verifier:** Sonnet.
> Read `qwen_implementation_guide.md` + `CLAUDE.md` first. Do **not** git-commit — the user does.

## 1. Goal
The frontend currently fails `tsc`/`npm run dev` because **4 `src/lib/*.ts` modules are missing**
(lost in the git incident). Rebuild exactly those 4 modules from their existing contracts so that
`npx tsc --noEmit` is clean, `npm run lint` is clean, `npm test` is all-green, and `npm run dev`
renders the login + dashboard pages with no missing-module errors. Also correct the dead Excel
commands in `README.md`.

This is a **TDD rebuild**: the tests already exist and define the contract. Make them pass; do not
edit the tests.

## 2. Scope
**Create these 4 files (and only these):**
- `src/lib/constants.ts`
- `src/lib/chart-helpers.ts`
- `src/lib/projects.ts`
- `src/lib/cascading-filters.ts`

**Edit:**
- `README.md` — remove/correct the two dead ingestion commands (see §4.5).

**Do NOT touch:** any test in `tests/`, `src/server/providers/sample-data.ts` (it already exists
and is correct), `src/lib/utils.ts`, backend code, or anything under `services/`. The `fr-CA`→
`en-CA` locale flip is **out of scope** (it's P1.4, not the build-unblock).

## 3. Contracts (source of truth)
Drive every signature from these existing files — do not invent surface:
- `tests/seed-parity.test.ts`, `tests/chart-helpers.test.ts`, `tests/active-window.test.ts`,
  `tests/cascading-filters.test.ts`
- Importers: `src/app/login/page.tsx`, `src/app/dashboard/page.tsx`,
  `src/app/dashboard/projects/[projectId]/charts-section.tsx`,
  `src/app/dashboard/projects/[projectId]/visits/visits-table.tsx`,
  `src/server/providers/sample-data.ts`, `src/server/providers/sample-provider.ts`
- Baseline facts: `updates/context.md §5`.

## 4. Implementation, file by file

### 4.1 `src/lib/constants.ts`
Export exactly the symbols its consumers import (verified by grep — nothing more is required):

```ts
// Acceptance baseline (Brasserie Labatt / Messi+Flying Fish)
export const EXPECTED_VISIT_COUNT = 436;
export const EXPECTED_UNIQUE_STORES = 436;
export const EXPECTED_DATE_START = "2026-03-06";   // ISO yyyy-mm-dd
export const EXPECTED_DATE_END = "2026-04-08";
export const EXTRA_SURVEY_ID = "1737162";          // string — must remain present in the dataset
export const ROWS_WITH_NO_PHOTOS = 3;

// Per-slot photo coverage. Keys MUST be exactly: STOREFRONT, PHOTO_1 … PHOTO_9
// (these are the slots tested in seed-parity.test.ts). Use the documented counts from
// updates/context.md §5. The generator in sample-data.ts consumes PHOTO_COUNTS to emit
// exactly that many photos per slot, and arranges exactly ROWS_WITH_NO_PHOTOS (3) rows
// with no photos — so the values here and the generator stay self-consistent and the
// parity test recount matches by construction.
export const PHOTO_COUNTS: Record<string, number> = { /* STOREFRONT, PHOTO_1..PHOTO_9 */ };

// Demo login credentials (shown on the login page)
export const DEMO_ADMIN_EMAIL = "admin@demo.local";
export const DEMO_CLIENT_EMAIL = "client-test1@demo.local";
export const DEMO_PASSWORD = "Demo123!";

// Demo project descriptor (used by the sample provider)
export const DEMO_CLIENT_NAME = "Brasserie Labatt";
export const DEMO_CLIENT_SLUG = "labatt";
export const DEMO_PROJECT_ID = /* the project id the sample provider expects */;
export const DEMO_PROJECT_NAME = "Messi and Flying Fish";
export const DEMO_PROJECT_SLUG = /* the project slug */;
```

Notes:
- Confirm the demo email/password against `README.md` (admin `admin@demo.local`,
  client `client-test1@demo.local`, password `Demo123!`) and `knowledge_base/RBAC_MODEL.md`.
- For `DEMO_PROJECT_ID`/`DEMO_PROJECT_SLUG`/`DEMO_PROJECT_NAME`/`DEMO_CLIENT_SLUG`, use the values
  the rest of `sample-provider.ts` already assumes (read the whole file). Keep all vocabulary
  **English**.
- **Do NOT** add `STANDEE_TARGET`, `FLYING_FISH_TARGET`, or `INSTALL*_SUCCESS_VALUES` — nothing
  imports them; `sample-provider.ts` uses literals and `INSTALL*_COUNTS` are local to `sample-data.ts`.
- The exact `PHOTO_COUNTS` numbers must let the generator produce a valid 436-row dataset with
  exactly 3 no-photo rows. `npm test` is the arbiter — if `seed-parity.test.ts` fails, adjust the
  values (and read how `sample-data.ts` lines ~250+ assign photos) until green.

### 4.2 `src/lib/chart-helpers.ts`
```ts
export function buildTrendData(dates: string[]): { date: string; count: number }[];
export function installGridClass(slotCount: number): string;
```
- `buildTrendData`: `[]` for empty input; group by the `YYYY-MM-DD` prefix of each ISO string
  (ignore time); return `{ date, count }` per distinct day **sorted chronologically ascending**.
- `installGridClass`: `1|2 → "lg:grid-cols-2"`, `3 → "lg:grid-cols-3"`, `4 → "lg:grid-cols-4"`,
  `>4 → "lg:grid-cols-4"` (clamp). (See `tests/chart-helpers.test.ts` for exact cases.)

### 4.3 `src/lib/projects.ts`
```ts
export function isProjectActive(project: { startDate: Date | null; endDate: Date | null }): boolean;
```
- Active when **today** is within `[startDate, endDate]`, **inclusive** on both ends.
- `null` start and/or end = unbounded on that side (both null ⇒ always active).
- **Gotcha (must handle):** compare on **calendar-date granularity**, not raw timestamps. The test
  sets system time to `2026-03-15T12:00:00` (local) while window dates parse as UTC midnight; a
  naive `now <= endDate` timestamp compare fails the "active on exactly the end date" case. Truncate
  both sides to date (or treat `endDate` as inclusive through its whole day) so the boundary tests
  pass. (See `tests/active-window.test.ts`.)

### 4.4 `src/lib/cascading-filters.ts`
```ts
export const ALL: /* sentinel for "no selection" — see how the test & visits-table use it */;
export type ActiveFilters = { city: string; i1: string; i2: string; i3: string };
export function rowsExcluding<T>(rows: T[], filters: ActiveFilters, skip: keyof ActiveFilters | "city"|"i1"|"i2"|"i3"): T[];
export function cascadingOptions(rows: Array<Record<string, any>>, field: string, current: string): string[];
```
- Row shape in tests: `{ city, install1, install2, install3 }`. Filter dimension → row field map:
  `city→city`, `i1→install1`, `i2→install2`, `i3→install3`.
- `rowsExcluding(rows, filters, skip)`: apply every active filter (value !== `ALL`) **except** the
  `skip` dimension's own filter. Returns the surviving rows.
- `cascadingOptions(rows, field, current)`: unique non-null values of `field` in `rows`, **sorted**,
  and **always include `current`** even if filtering would otherwise exclude it (unless `current` is
  `ALL`).
- `visits-table.tsx` imports `rowsExcluding` aliased as `cascadeRows` — keep the export name
  `rowsExcluding`. Match exact behaviors in `tests/cascading-filters.test.ts`.

### 4.5 `README.md` correction
The Excel-era ingestion path is dead (loader now lives in `services/ingestion/persistence.py`).
Remove or correct these dead commands so the README is runnable:
- Line ~163: `python -m services.ingestion.seed_local_dummy_db` (dead — remove).
- Line ~97 (Project Structure): `transform_local_dummy_db.py  # Persist to Postgres` and
  `local_fixtures.py # Excel workbook loader` reference files that no longer exist — update the
  structure listing to reflect `persistence.py` (`load_transformed_dataset()`) instead.
Keep `python -m services.ingestion.refresh` (still valid). Do not invent new commands.

## 5. Red lines that apply
- Keep all new vocabulary **English** (`.claude/rules/workbook-parity.md`). Do not flip the locale.
- The sample generator must stay **deterministic** and must **not** mint extra/synthetic surveys
  (`.claude/rules/workbook-parity.md`, Bug A). You are not editing the generator — just constants.
- No git operations.

## 6. Verification gates (all must pass before stopping)
```bash
npx tsc --noEmit          # clean (no missing-module / type errors)
npm run lint              # clean
npm test                  # all green — esp. seed-parity, chart-helpers, active-window,
                          #             cascading-filters, provider-contract, rbac
npm run dev               # then open http://localhost:3000 — login + dashboard render
```
Paste the `npm test` summary. If `seed-parity` fails on photo counts, tune `PHOTO_COUNTS` per §4.1.

## 7. Definition of done
- [ ] The 4 `src/lib/*.ts` files created; `tsc`/`lint`/`test` all green (output pasted).
- [ ] `npm run dev` renders login + dashboard, no missing-module errors.
- [ ] `README.md` dead Excel commands corrected.
- [ ] Only in-scope files changed; tests unmodified; no git operations.
- [ ] Any value you had to infer (e.g. exact `PHOTO_COUNTS`, `DEMO_PROJECT_*`) is noted in your summary.
