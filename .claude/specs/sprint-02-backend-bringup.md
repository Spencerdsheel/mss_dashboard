# Sprint 02 — Backend bringup + `backend_tests/` baseline

> **Author:** Opus (planner). **Implementer:** Qwen 3.5 via opencode. **Verifier:** Sonnet.
> Read `qwen_implementation_guide.md` + `CLAUDE.md` first. Do **not** git-commit — the user does.

## 0. Status — the bringup is already GREEN (done by Opus during planning)
The backend runs end-to-end. Verified live:
- DB reset (stale `mss_dashboard_pgdata` volume dropped) → `postgres/admin` works; schema auto-applied.
- Seeded (`scripts/seed_multi_tenant_test_data.py --tenants 2`): Labatt **436** (survey 1737162 present)
  + Test Client Alpha 1039; admin + 2 client users.
- API serves data: `/healthz`,`/readyz` 200; admin login OK; `/projects`, `/summary`
  (real install distribution), `/visits` (436). RBAC isolation holds (client→other tenant 404, `/admin` 403).
- Live ingestion: mock on 8020 + refresh → `success`, Labatt **436→436 (idempotent)**, English
  install distribution (no Bug A / no Bug B in this path).

**Two dependency fixes were applied to make it run (already in `requirements-backend.txt`):**
1. `starlette>=0.40,<1` — `fastapi>=0.115,<1` alone allowed Starlette **1.3**, which breaks
   `prometheus-fastapi-instrumentator` 5.11 (`AttributeError: '_IncludedRouter' ... 'path'` → 500 on every request).
2. `python-multipart` — was missing entirely; required by the mock server's form-data endpoints.

## 1. Goal (this sprint's Qwen task)
Recreate a minimal **`backend_tests/`** pytest suite (lost in the git incident) so
`python -m pytest backend_tests -v` runs **green**. Unit-first, no live DB/Redis required.

## 2. Scope
**Create:** `backend_tests/__init__.py` (if needed) + the test modules in §4. Add a `conftest.py`
only if a shared fixture is genuinely needed (keep it minimal).
**Do NOT touch:** any `services/**` source, the schema, the seeder, `requirements-backend.txt`
(already fixed), or anything under `src/`. If a test reveals a real bug in `services/`, **stop and
report it** — do not fix product code under cover of a test.

## 3. How to run (all Python in the conda env `venv`)
```bash
conda activate venv        # or call ./venv/python.exe directly
python -m pytest backend_tests -v
```
Tests must not require a running Postgres/Redis/mock or network. Use in-memory objects and tiny
fixtures. Import modules from `services.*` (run from repo root so the package is importable).

## 4. Test modules (start here — pure unit, high value)
Derive exact signatures by reading each module first; do not assume.
- **`test_security.py`** — `services/common/security.py`: `hash_password` then verify round-trips;
  a wrong password fails; a tampered/short password is rejected; JWT mint→decode round-trip
  (HS256) preserves `sub`, `tenant_id`, `role`, `project_ids`; an expired/invalid token is rejected.
- **`test_secrets.py`** — `services/common/secrets.py`: `encrypt_secret`/`decrypt_secret` round-trip
  with a key; ciphertext ≠ plaintext; decrypt with the **wrong key** raises (AES-256-GCM auth tag).
- **`test_campaigns.py`** — `services/common/campaigns.py`: `synthetic_template_index` is
  deterministic for a given tenant_id and in range; `LABATT_CAMPAIGN` has the expected slot
  titles (Standee Messi / Flying Fish Display / Stock-Supply) and English answer labels.
- **`test_transform.py`** — `services/ingestion/transform.py`: feed `transform_shopmetrics_rowsets`
  a tiny hand-built rowset (1–2 visits, a photo) with a `TransformContext`; assert it yields the
  expected normalized visits/photos and stamps `tenant_id`/`project_id`. (This guards Bug B —
  install answer text should pass through, not collapse to "Not targeted".)
- **`test_tenancy.py`** — `services/common/tenancy.py` (+ models): `assert_project_access` (or the
  equivalent) allows ADMIN, allows a CLIENT for an owned project, and **raises** for a CLIENT on a
  foreign tenant/project. tenant_id is taken from claims only.
- **`test_rate_limiter.py`** — `services/api/rate_limiter.py`: the in-memory limiter allows up to
  the threshold and blocks the next request, without Redis.

Keep each test small and behavior-focused (see the `testing-strategy` skill). If a target function
needs a DB handle, prefer the InMemory repository or a fake; **defer** true DB-backed
`postgres_repository` integration tests and HTTP two-tenant isolation tests to **P4** (record them
as `@pytest.mark.skip(reason="P4: needs live DB")` stubs if you want them visible).

## 5. Red lines that apply
- No git. All Python in `venv`. Don't log secrets in test output. Don't weaken product code to make
  a test pass; don't edit `services/**`.

## 6. Verification gate
```bash
python -m pytest backend_tests -v      # all green (or green + explicit P4 skips)
```
Paste the pytest summary.

## 7. Definition of done
- [ ] `backend_tests/` created; `python -m pytest backend_tests -v` green (output pasted).
- [ ] Only `backend_tests/**` changed; no `services/**` or `src/**` edits.
- [ ] Any real product bug a test uncovered is reported, not silently patched.
- [ ] No git operations.

## 8. Follow-on (not this sprint)
- **P1.4:** per-project campaign model polish; confirm Bug A/Bug B stay absent under repeated
  ingests across all tenants; locale flip `fr-CA`→`en-CA` (projects still report `fr-CA`).
- **P4:** DB-backed repository tests, HTTP two-tenant isolation, ingestion idempotency assertions.
- **Doc:** update `services/LOCAL_FAKE_SHOPMETRICS.md` + README to the standalone 8020 mock
  (drop the stale `/fake-shopmetrics@8010` + `seed_local_dummy_db` instructions).
