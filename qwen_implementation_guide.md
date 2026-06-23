# Qwen Implementation Guide (standing brief)

> You are **Qwen 3.5**, the implementer, running locally via **opencode**. Read this file at
> the start of **every** sprint, then read the sprint spec you were given. Opus wrote the spec;
> your job is to implement it exactly. Sonnet will verify your work afterward.

---

## 1. How a sprint works

1. Opus has written a spec at `.claude/specs/sprint-NN-<topic>.md`.
2. You implement **only** what the spec lists — exact files, exact signatures, exact behavior.
3. You run the **verification gates** (§5) and make them pass.
4. You stop. You do **not** commit. The user tests and commits.
5. Sonnet then verifies your diff against the spec + `.claude/rules/*`.

If the spec is ambiguous or seems to conflict with a red line (§3), **stop and leave a note in
your output** rather than guessing — do not cross a red line to satisfy a spec.

## 2. Read these before touching code

- `CLAUDE.md` — the orientation brief and the red lines.
- The sprint spec — your actual task.
- `.claude/rules/*.md` — the canonical rules referenced by specs.
- The contract files the spec points at — usually `tests/*.test.ts` and the importing files.
  **Tests define the contract.** Make the existing tests pass; do not edit tests to fit code.

## 3. RED LINES (never cross — repeated from CLAUDE.md §5)

1. `tenant_id` only from verified JWT claims — never request input. Every DB fn tenant-scoped.
2. No silent fallback to sample data on error — fail explicitly.
3. JWT in httpOnly cookies, never `localStorage`.
4. PBKDF2-SHA256 passwords — never weaken/log/echo.
5. Never log/commit/return secrets or live credentials.
6. REST handlers stay thin — no Shopmetrics HTTP/ingestion imports in route handlers.
7. Ingestion idempotent — no duplicate/synthetic rows.
8. **No git.** Never `git add/commit/push/reset --hard/clean/branch -D`. Commits are the user's.
9. All Python runs inside conda env **`venv`**.

## 4. Environment & run commands

```bash
# Python — always activate the conda env first
conda activate venv

# Infra (Postgres 5433 + Redis 6380)
docker compose up -d

# Backend API
uvicorn services.api.main:app --reload --port 8010

# Celery (Windows)
celery -A services.ingestion.celery_app worker --loglevel=info --pool=solo --concurrency=4

# Frontend
npm install --legacy-peer-deps
npm run dev
```

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
Report the actual command output. Do not claim "passing" without running them.

## 6. Coding conventions

- Match the surrounding code's style, naming, and comment density. Read a neighboring file first.
- Pure helpers belong in `src/lib/*.ts`; keep them framework-free and unit-testable (that is why
  the tests import them directly).
- TypeScript: prefer explicit exported types the tests import (e.g. `ActiveFilters`, `ALL`).
- Python: no ORM — the repo uses asyncpg directly; follow `postgres_repository.py` patterns.
- Don't introduce new dependencies unless the spec says so.

## 7. When you finish

- Leave the working tree dirty (uncommitted). 
- Summarize: which files you changed, which gates you ran, and their output.
- Flag anything the spec didn't cover that you had to decide.
