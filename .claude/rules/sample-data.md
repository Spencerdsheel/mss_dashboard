# Rule: No Silent Sample-Data Fallback

Sample data is the **acceptance baseline** until live iSN/Shopmetrics credentials exist — but it
must never silently stand in for real data when something fails.

## Must

- The deterministic sample provider (`src/server/providers/sample-data.ts`) is used **only** in
  explicitly sample/dev mode, and its output must satisfy the workbook-parity contract
  (see `workbook-parity.md`).
- On an auth or API error, **fail explicitly**: redirect to login, surface the error, return the
  error status. The user must be able to tell real data from sample data.
- Baseline (must stay true): Client **Brasserie Labatt**; projects **Messi** + **Flying Fish**;
  **436** total visits; date range **2026-03-06 → 2026-04-08**; survey ID **1737162** present.

## Must not

- On a `/projects/...` fetch error, do not catch-and-return sample data as if it were live.
- Do not let a missing/expired token quietly resolve to a populated dashboard.

## Verify

With no/invalid token, the dashboard redirects to login — it does **not** render sample rows.
