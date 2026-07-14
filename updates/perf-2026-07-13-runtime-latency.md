# Runtime Latency Investigation — 2026-07-13

> **Purpose.** Log of a diagnosis-and-fix pass on dashboard runtime slowness reported via
> live `npm run dev` logs (warm/already-compiled routes taking 1–12+ seconds). Read this
> before re-investigating "the dashboard feels slow" — the root cause and fix direction are
> already established here; don't re-derive from scratch. See `CLAUDE.md` for architecture
> orientation and `.claude/rules/*.md` for the red lines referenced below.

---

## 0. TL;DR

The slowness was **not** the backend, the database, Redis, or the earlier Turbopack
compile-time fix (`package.json` `dev` script, `next.config.ts` `optimizePackageImports` —
both already shipped and correct). It was **`next dev` itself**: single-threaded,
non-minified, instrumented Server Component rendering that serializes badly under
concurrent requests. Measured directly — see §2. Two additional, real (not dev-only) waste
sources were found and are queued as fixes — see §3.

---

## 1. Symptom

User-supplied `npm run dev` log showed already-compiled routes spiking to multi-second
response times with no consistent pattern, e.g.:

```
GET /dashboard/projects/project_brasserie_labatt 200 in 11876ms   (route compiled earlier at 5174ms, 763ms)
GET /dashboard/projects/project_brasserie_labatt/visits/1708249 200 in 5530ms / 7892ms
POST /admin/photo-slots 303 in 13928ms
```

These are warm-route hits, not first-compile cost — ruled out as a compile-time issue.

---

## 2. Root cause — confirmed by direct measurement, not inference

Two agents independently measured this live (backend under load, then dev vs. prod
side-by-side) rather than reading code and guessing.

**Backend is not the bottleneck.** FastAPI endpoints (`/projects/{id}/summary`, `/visits`,
`/projects`) respond in 12–272ms, including under 10-way parallel load. asyncpg pooling
initializes correctly (`postgres_repository.py:48-67`); the summary endpoint is one
consolidated CTE + Redis SWR cache (`routes/projects.py:133-140`); Postgres/Redis containers
were healthy throughout.

**`next dev` is the bottleneck, and it disappears in production.** Same machine, same
backend, same warm route:

| Load             | `next dev` (turbopack)      | `next build && next start`   |
|------------------|------------------------------|-------------------------------|
| Sequential warm  | 0.57–1.74s                   | **0.044–0.071s** (~15–20x)     |
| 8-way concurrent | 2.2–8.4s (staircase pattern)  | **0.26–0.72s**                 |
| 16-way concurrent| —                             | 0.5–2.6s                       |

A real render costs ~50ms in production; dev mode's non-minified, on-demand-compiled,
dev-instrumented RSC rendering inflates that to seconds, and concurrent requests to the
same route queue behind each other on `next dev`'s single Node process — this queueing,
not compilation, produced the 1–12s spikes in the original log.

**Residual, real limit (not currently the cause, but worth knowing):** even in production,
`next start` is one Node process — one thread for synchronous RSC serialization. Next.js
has no runtime render-worker pool (render workers exist only at build time —
[next.js#20466](https://github.com/vercel/next.js/discussions/20466)). The 16-way concurrent
number above shows the queue starting to grow linearly. This only matters once real
concurrent user traffic arrives; the standard mitigation is horizontal scaling (multiple
containers/processes behind a reverse proxy), not a code fix — see §4 item 5.

---

## 3. Two genuine (not dev-only) inefficiencies found alongside the above

These would waste CPU/bytes even in production, and are the recommended next fixes:

1. **Overview page ships the entire visit list through the RSC payload on every request.**
   `src/app/dashboard/projects/[projectId]/page.tsx:22-25` fetches all 436 visit rows
   (~10 photo-URL fields each) via `provider.listVisits()` with `cache: "no-store"`
   (`src/server/backend-api.ts:100`) under `force-dynamic` (`page.tsx:6`). Verified that
   `overview-grid.tsx` only ever uses this data for four aggregates: trend-by-day, radar
   data, top-5 cities, last-visit day. `/visits` returns ~176KB vs. `/summary`'s ~2KB —
   this is the largest single avoidable per-render cost.

2. **No `React.cache()` dedup on auth/session checks in the project layout+page tree.**
   `layout.tsx:11-13` calls `requireSession()` then `assertProjectAccess()` (which itself
   calls `requireSession()` again — `rbac.ts:61`), then `page.tsx:14` calls
   `assertProjectAccess()` a third time. Net effect: 2 duplicate backend
   `GET /projects/{id}` round-trips + 3 cookie/JWT parses per single page render.

**Deliberately not fixing right now:** adding a shared Next.js Data Cache /
`unstable_cache` layer. `backend-api.ts:93-101` already has the `cacheOptions` plumbing but
no call site uses it. Judgment call: a shared cache key here risks violating the
tenant-isolation red line (`.claude/rules/tenant-isolation.md` — "no cross-tenant unkeyed
cache") and the no-silent-stale-data rule (`.claude/rules/sample-data.md`) unless the cache
key is proven to include tenant/token identity end-to-end. Fixes 1–2 remove the need for
this at current scale; revisit only if profiling after those fixes still shows a gap.

---

## 4. Fix list (ranked)

1. **Demo/deploy on `next build && next start`, never `next dev`.** Free 15–20x, zero code
   risk. `knowledge_base/08_INFRASTRUCTURE.md` already targets Next's `standalone` output
   mode in a production container behind Nginx as the target architecture — `next.config.ts`
   does not yet set `output: "standalone"`; a one-line addition once containerized.
   **Status: documented, not yet applied to `next.config.ts` (no container work started).**
2. **Stop shipping raw `visitRows` into the overview RSC payload** — compute the four
   aggregates server-side in the page component instead. Frontend-only change, no backend
   spec required. **Status: pending.**
3. **Wrap `requireSession`/`assertProjectAccess` in `React.cache()`** (`src/server/rbac.ts`).
   Per-request-scoped dedup only — does not skip any auth check, does not introduce
   cross-request caching, no tenant-isolation risk. **Status: pending.**
4. Skip shared Data Cache for now — see judgment call in §3. **Status: intentionally
   deferred.**
5. **Multi-process scaling (PM2 cluster / multiple containers)** — only worth it once real
   concurrent user load materializes; a deployment-topology decision requiring explicit user
   sign-off, not a code fix. **Status: not needed yet, flagged for later.**

## 5. Verification method (for future re-checks)

- Confirm backend isn't regressed: hit `/projects/{id}/summary` and `/visits` directly
  under a small concurrent load (e.g. 8-way `curl`/fetch loop) — expect double/low-triple-digit
  ms responses.
- Confirm frontend: compare the same warm route under `next dev` vs.
  `next build && next start` at matching concurrency — expect the ~15–20x gap in §2 to
  reproduce. If it doesn't, the dev/prod delta itself has regressed and needs fresh
  investigation.
