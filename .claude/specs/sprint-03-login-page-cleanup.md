# Sprint 03 — Login page cleanup (branding, remove demo artifacts)

> **Author:** Opus (planner). **Implementer:** Qwen 3.5 via opencode. **Verifier:** Sonnet.
> Read `qwen_implementation_guide.md` + `CLAUDE.md` first. Do **not** git-commit — the user does.

## 1. Goal

The login page currently shows "Prototype Dashboard", demo credentials, placeholder emails, and
"SM" branding from the prototype era. After this sprint, the login page shows "iSN Dashboard"
branding, no demo references, no pre-filled credentials, and uses the iSN logo.

**What "done" looks like:** a user visiting `/login` sees "iSN Dashboard" branding, a clean sign-in
form with blank inputs, no demo accounts box, and the iSN logo. No backend changes. All existing
tests still pass.

## 2. Scope

**Edit these files (and only these):**
- `src/app/login/page.tsx` — branding text, remove demo box, add logo
- `src/app/login/login-form.tsx` — clear placeholder text from inputs

**Do NOT touch:**
- `src/lib/constants.ts` — the `DEMO_ADMIN_EMAIL`, `DEMO_CLIENT_EMAIL`, `DEMO_PASSWORD` exports
  are still used by tests and the sample-data provider. Only the import in `page.tsx` is removed.
- Any backend files, `services/*`, test files, or other frontend pages.
- `src/app/login/actions.ts` — the login flow itself is unchanged.

## 3. Contracts

No tests define the exact login page text. The contract is the user's explicit requirements:

| Current text / element | Replacement |
|------------------------|-------------|
| `SM` in 9×9 grid box (line 27) | iSN logo — see §4.1 |
| `Prototype Dashboard` (line 29) | `iSN Dashboard` |
| `Real-time retail execution\nfor Demo Client.` (lines 33-36) | `Real time unified retail Dashboard` (single line, no `<br/>`, no `<span>`) |
| "Project Messi and Flying Fish..." paragraph (lines 38-41) | **Delete entirely** |
| `© {year} Prototype Dashboard — Demo build` (line 44) | `© {year} iSN Dashboard` |
| `Use your demo credentials to access the dashboard.` (line 53) | `Use your credentials to access the dashboard.` |
| Demo accounts box (lines 59-73) | **Delete entirely** |
| Import of `DEMO_ADMIN_EMAIL, DEMO_CLIENT_EMAIL, DEMO_PASSWORD` (line 4) | **Remove this import** |
| Email input `placeholder="admin@demo.local"` (login-form.tsx line 39) | `placeholder=""` |
| Password input `placeholder="Demo123!"` (login-form.tsx line 49) | `placeholder=""` |

## 4. Implementation notes

### 4.1 Logo placement

The user will provide an SVG or PNG logo file. **Before implementing:**

1. Check if the file exists at `public/isn-logo.svg` or `public/isn-logo.png`.
2. If it exists, use `<Image>` from `next/image` to render it in place of the `SM` grid box:
   ```tsx
   import Image from "next/image";
   // ...
   <Image src="/isn-logo.svg" alt="iSN" width={36} height={36} className="rounded-lg" />
   ```
3. If no logo file exists yet, use a text-based fallback:
   ```tsx
   <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-brand-foreground text-xs font-bold">
     iSN
   </div>
   ```
   Leave a `// TODO: Replace with <Image src="/isn-logo.svg"> when logo file is provided` comment.

### 4.2 Text changes in page.tsx

The left panel text section (lines 32-42) currently has two elements — a `<p>` heading and a `<p>`
description. After the change:
- The heading becomes: `Real time unified retail Dashboard` — single `<p>` tag, no `<br/>`, no
  inner `<span>` tags. Keep the same CSS classes (`text-3xl font-semibold leading-tight tracking-tight`).
- The description paragraph is deleted entirely (the one about "Project Messi and Flying Fish").

### 4.3 Footer text

Line 44: Replace the content inside the `<div>` tag:
```tsx
© {new Date().getFullYear()} iSN Dashboard
```

### 4.4 Demo accounts box removal

Delete lines 59-73 entirely (the `<div className="rounded-lg border bg-muted/40...">` block).
Since the `DEMO_*` constants are no longer referenced in this file, also remove the import on line 4.

## 5. Red lines that apply here

- **No silent fallbacks (CLAUDE.md §5.2):** The login page must still redirect to `/dashboard` if
  a valid token exists (line 15). Do not change the auth flow.
- **Token storage (CLAUDE.md §5.3):** JWT stays in httpOnly cookies. Do not add any `localStorage`
  references.

## 6. Verification gates (must all pass before stopping)

```bash
# frontend
npx tsc --noEmit
npm run lint
npm test
# visual
npm run dev    # then visit http://localhost:3000/login and verify:
               # - "iSN Dashboard" branding (not "Prototype Dashboard")
               # - No demo accounts box
               # - Empty input placeholders
               # - No "Messi and Flying Fish" text
               # - Footer says "iSN Dashboard"
```
Report the actual output of tsc/lint/test.

## 7. Definition of done

- [ ] All verification gates green (with pasted output).
- [ ] Login page shows "iSN Dashboard" branding with logo.
- [ ] No demo credentials visible anywhere on the page.
- [ ] Input fields have empty (or generic) placeholders.
- [ ] "Demo accounts" box is removed.
- [ ] `constants.ts` is NOT modified (imports removed from page.tsx only).
- [ ] Only `src/app/login/page.tsx` and `src/app/login/login-form.tsx` changed.
- [ ] No git operations performed.
