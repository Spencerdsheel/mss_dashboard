# Sprint NN — <topic>

> **Author:** Opus (planner). **Implementer:** Qwen 3.5 via opencode. **Verifier:** Sonnet.
> Read `qwen_implementation_guide.md` + `CLAUDE.md` first. Do **not** git-commit — the user does.

## 1. Goal
<One paragraph: what "done" looks like in user-observable terms.>

## 2. Scope
**In scope (edit these and only these):**
- `path/to/file` — <why>

**Out of scope (do NOT touch):**
- <files/areas> — <why>

## 3. Contracts (the source of truth)
<Tests / importing files that define exact signatures. The implementer makes these pass;
they do NOT edit the tests to fit the code.>

### Exact exports / signatures
```ts
// path/to/file.ts
export function foo(...): ...;
```

## 4. Implementation notes & gotchas
<Edge cases, tz traps, ordering, determinism requirements, things easy to get wrong.>

## 5. Red lines that apply here
<Subset of CLAUDE.md §5 relevant to this sprint, e.g. tenant isolation, no silent fallback.>

## 6. Verification gates (must all pass before stopping)
```bash
# frontend
npx tsc --noEmit
npm run lint
npm test
# backend
conda activate venv && python -m pytest backend_tests -v
```
Report the actual output.

## 7. Definition of done
- [ ] All gates green (with pasted output).
- [ ] Only in-scope files changed.
- [ ] No git operations performed.
- [ ] Notes on any decision the spec didn't cover.
