# Sprint 04 — Home page fixes (badge swap, section rename, date filter, dynamic title)

> **Author:** Opus (planner). **Implementer:** Qwen 3.5 via opencode. **Verifier:** Sonnet.
> Read `qwen_implementation_guide.md` + `CLAUDE.md` first. Do **not** git-commit — the user does.

## 1. Goal

The home page (dashboard index) currently shows "436 visits" badges on project cards, labels one
section "Past / Upcoming", and has a hardcoded "iSN" title in the nav. After this sprint:

1. Project cards show "Live" or "Completed" badges instead of visit counts.
2. The "Past / Upcoming" section is renamed "Ongoing Projects".
3. A date filter bar lets users filter projects by time period.
4. The header title is fetched from a DB setting and is admin-editable.

## 2. Scope

**Edit these files:**
- `src/app/dashboard/page.tsx` — section heading rename, extract client component
- `src/components/app-shell.tsx` — accept `siteTitle` prop
- `src/app/dashboard/layout.tsx` — fetch site title, pass to AppShell

**Create these files:**
- `src/app/dashboard/project-grid.tsx` — client component with filter state + project cards
- `src/app/admin/settings/page.tsx` — admin page for editing platform settings
- `src/app/admin/settings/settings-client.tsx` — client component for settings form
- `src/app/admin/settings/actions.ts` — server actions for settings CRUD

**Backend — Edit:**
- `services/ingestion/dashboard_schema.sql` — add `platform_settings` table
- `services/common/postgres_repository.py` — add `get_platform_setting()`, `set_platform_setting()`
- `services/api/routes/admin.py` — add `GET/PATCH /admin/settings/{key}` endpoints

**Do NOT touch:**
- `src/lib/constants.ts`, test files, `services/ingestion/` (other than schema), auth code.

## 3. Implementation details

### 3a. "Past / Upcoming" → "Ongoing Projects"

**File:** `src/app/dashboard/page.tsx` line 97

```tsx
// Before:
<h2 ...>Past / Upcoming</h2>

// After:
<h2 ...>Ongoing Projects</h2>
```

### 3b. Visit badge → Live/Completed indicator

**File:** `src/app/dashboard/project-grid.tsx` (new client component extracted from page.tsx)

The project card badge currently shows:
```tsx
<Badge variant="success">
  {p.visitCount != null ? `${p.visitCount.toLocaleString()} visits` : "Active"}
</Badge>
```

Replace with:
```tsx
<Badge variant={isProjectActive(p) ? "success" : "secondary"}>
  {isProjectActive(p) ? "Live" : "Completed"}
</Badge>
```

The `isProjectActive` function is already available from `@/lib/projects`. Import it in the new
client component.

### 3c. Date filter on home page

Extract the project grid into a new `"use client"` component: `src/app/dashboard/project-grid.tsx`.

**Props:**
```tsx
interface ProjectGridProps {
  projects: ProjectListItem[];
}
```

**Filter bar** — rendered above the project grid. Options:
- "All Active" (default on load — shows only currently active projects)
- "Current Month"
- "Last Month"
- "Last 2 Months"
- "Last 3 Months"
- "Custom Range" (shows two date pickers)

**Filter logic** — a project matches a period if its `[startDate, endDate]` range overlaps the
selected period `[filterStart, filterEnd]`. Overlap test:
```ts
function projectOverlapsPeriod(p: ProjectListItem, start: Date, end: Date): boolean {
  const pStart = p.startDate ? new Date(p.startDate) : new Date(0);
  const pEnd = p.endDate ? new Date(p.endDate) : new Date("2099-12-31");
  return pStart <= end && pEnd >= start;
}
```

When "All Active" is selected, use the existing `isProjectActive(p)` filter.

**Layout:** The grid still splits into "Active" and "Ongoing Projects" sections, but now only
shows projects matching the selected filter.

**File: `src/app/dashboard/page.tsx`** — refactor to:
```tsx
export default async function DashboardIndex() {
  const session = await requireSession();
  const projects = await listVisibleProjects();
  
  return (
    <AppShell session={session as any}>
      <ProjectGrid projects={projects} />
    </AppShell>
  );
}
```

### 3d. Dynamic header title (DB-backed)

#### Database

Add to `services/ingestion/dashboard_schema.sql`:
```sql
CREATE TABLE IF NOT EXISTS dashboard.platform_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO dashboard.platform_settings (key, value)
VALUES ('site_title', 'iSN')
ON CONFLICT (key) DO NOTHING;
```

#### Repository

Add to `services/common/postgres_repository.py`:
```python
async def get_platform_setting(self, key: str) -> str | None:
    row = await self._fetch_one(
        "SELECT value FROM dashboard.platform_settings WHERE key = $1",
        key,
    )
    return row["value"] if row else None

async def set_platform_setting(self, key: str, value: str) -> str:
    await self._execute(
        """
        INSERT INTO dashboard.platform_settings (key, value, updated_at)
        VALUES ($1, $2, now())
        ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()
        """,
        key, value,
    )
    return value
```

Also add these methods to the `DashboardRepository` Protocol in `services/common/repository.py`
and provide stubs in any in-memory implementation.

#### API endpoints

Add to `services/api/routes/admin.py`:
```python
@router.get("/settings/{key}")
async def get_setting(
    key: str,
    _claims=Depends(require_admin_claims),
    repository: DashboardRepository = Depends(get_repository),
) -> dict:
    method = require_admin_operation(repository, "get_platform_setting")
    value = await method(key)
    if value is None:
        raise NotFoundError(f"Setting '{key}' not found")
    return {"key": key, "value": value}

@router.patch("/settings/{key}")
async def update_setting(
    key: str,
    request: SettingUpdateRequest,
    _claims=Depends(require_admin_claims),
    repository: DashboardRepository = Depends(get_repository),
) -> dict:
    method = require_admin_operation(repository, "set_platform_setting")
    value = await method(key, request.value)
    return {"key": key, "value": value}
```

Add the request model:
```python
class SettingUpdateRequest(BaseModel):
    value: str
```

#### Frontend — fetch and pass to AppShell

**File:** `src/app/dashboard/layout.tsx`

Fetch the site title via `backendGet("/admin/settings/site_title", token)` in the layout server
component and pass it to `AppShell` as a `siteTitle` prop. Handle the case where the fetch fails
(default to `"iSN"`).

**Note:** The settings endpoint requires ADMIN auth. For non-admin users, we need a public
endpoint or a different approach. **Recommended:** Add a separate public endpoint
`GET /settings/public/{key}` that returns only whitelisted keys (like `site_title`) without
requiring authentication. Add this under the `auth` router, not `admin`.

**File:** `src/components/app-shell.tsx`

Add optional `siteTitle` prop:
```tsx
export function AppShell({
  children,
  session,
  projectId,
  siteTitle = "iSN",  // default fallback
}: {
  // ... existing props
  siteTitle?: string;
}) {
```

Use it in the logo area (line 50):
```tsx
{siteTitle}
<span className="text-signal-orange text-xs leading-none">●</span>
```

#### Admin settings page

Create `src/app/admin/settings/page.tsx` — a simple admin page with a form to edit `site_title`.
Follow the same pattern as `src/app/admin/connections/page.tsx`: server component fetches data,
passes to a `"use client"` component for editing.

## 4. Red lines that apply here

- **Tenant isolation (CLAUDE.md §5.1):** The public settings endpoint must NOT leak tenant data.
  It only returns whitelisted keys like `site_title`. Do NOT expose tenant-scoped settings via
  this endpoint.
- **No silent fallbacks (CLAUDE.md §5.2):** If the settings fetch fails, use a hardcoded default
  (`"iSN"`), but do NOT suppress the error — log it server-side.
- **Thin REST handlers (CLAUDE.md §5.6):** Settings endpoints stay thin: validate → call repo →
  return response.

## 5. Verification gates

```bash
# frontend
npx tsc --noEmit
npm run lint
npm test

# backend
conda activate venv && python -m pytest backend_tests -v

# visual verification (npm run dev + backend running)
# 1. Login → Home page shows "Live"/"Completed" badges (no visit counts)
# 2. "Past / Upcoming" section now says "Ongoing Projects"
# 3. Date filter bar is visible and filters projects
# 4. Header shows dynamic title (default "iSN")
# 5. Admin → Settings page allows editing the title
```

## 6. Definition of done

- [ ] All verification gates green.
- [ ] Project cards show "Live" / "Completed" instead of "436 visits".
- [ ] Section heading says "Ongoing Projects".
- [ ] Date filter bar works with all options (including custom range).
- [ ] Header title is fetched from DB and editable via admin settings page.
- [ ] No git operations performed.
