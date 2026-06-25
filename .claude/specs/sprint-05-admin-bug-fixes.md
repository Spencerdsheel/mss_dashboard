# Sprint 05 — Admin bug fixes (project update, client_name edit, empty metrics)

> **Author:** Opus (planner). **Implementer:** Qwen 3.5 via opencode. **Verifier:** Sonnet.
> Read `qwen_implementation_guide.md` + `CLAUDE.md` first. Do **not** git-commit — the user does.

## 1. Goal

Three admin-related issues:

1. **Project name update loses visit_count** — editing a project name in admin sets `visit_count`
   to 0 in the response. After this sprint, the update returns the correct visit count.
2. **Connection display_name ≠ dashboard client_name** — users expect changing `display_name` on
   the Connections page to change what appears on dashboard cards, but they're different DB fields.
   After this sprint, the Projects admin page has a `client_name` edit field, and the Connections
   page has a clarifying note.
3. **Empty metrics sidebar** — the "Targets & Reference Metrics" card on the project page shows
   nothing when no metrics are configured. After this sprint, it shows an empty-state message.

## 2. Scope

**Edit these files:**
- `services/common/postgres_repository.py` — fix `update_project()` RETURNING clause; add
  `client_name` to the UPDATE
- `services/api/routes/admin.py` — add `client_name` to `ProjectUpdateRequest`
- `src/app/admin/projects/projects-client.tsx` — add `client_name` input to the edit form
- `src/app/admin/projects/actions.ts` — pass `client_name` through to API
- `src/server/admin-api.ts` — add `client_name` to `AdminProject` type and `adminUpdateProject`
  payload
- `src/app/admin/connections/connections-client.tsx` — add clarifying note about display_name
- `src/app/dashboard/projects/[projectId]/charts-section.tsx` — add empty-state for metrics

**Do NOT touch:**
- Auth code, ingestion code, test files, `models.py` (Project dataclass already has `client_name`).

## 3. Bug A: Project update loses visit_count

### Root cause

`services/common/postgres_repository.py`, method `update_project()` (around line 918):

```sql
UPDATE dashboard.projects
SET name = COALESCE($1, name), ...
WHERE tenant_id = $4 AND project_id = $5
RETURNING tenant_id, project_id, name, slug, client_name,
          provider_kind, start_date, end_date
```

The `RETURNING` clause does NOT include `visit_count`. But `project_from_row()` (line 972) does:
```python
visit_count=int(row.get("visit_count") or 0),
```

This evaluates to 0 because the key is absent. The frontend replaces local state with this
response, so the card shows 0 visits until page reload.

### Fix

Replace the UPDATE query with a CTE pattern that computes `visit_count`:

```python
async def update_project(
    self,
    tenant_id: str,
    project_id: str,
    name: str | None,
    start_date: str | None,
    end_date: str | None,
    client_name: str | None = None,   # NEW parameter
) -> Project:
    row = await self._fetch_one(
        """
        WITH updated AS (
            UPDATE dashboard.projects
            SET name        = COALESCE($1, name),
                start_date  = COALESCE($2::date, start_date),
                end_date    = COALESCE($3::date, end_date),
                client_name = COALESCE($6, client_name),
                updated_at  = now()
            WHERE tenant_id = $4 AND project_id = $5
            RETURNING *
        )
        SELECT u.tenant_id, u.project_id, u.name, u.slug, u.client_name,
               u.provider_kind, u.start_date, u.end_date,
               COALESCE(
                   (SELECT COUNT(*) FROM dashboard.visits v
                    WHERE v.tenant_id = u.tenant_id AND v.project_id = u.project_id),
                   0
               ) AS visit_count
        FROM updated u
        """,
        name,
        start_date,
        end_date,
        tenant_id,
        project_id,
        client_name,
    )
    if not row:
        raise ValueError(f"Project '{project_id}' not found for tenant '{tenant_id}'")
    return project_from_row(dict(row))
```

### Backend API change

In `services/api/routes/admin.py`, update `ProjectUpdateRequest`:

```python
class ProjectUpdateRequest(BaseModel):
    name: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    client_name: str | None = None    # NEW field
```

Update the `update_project` endpoint to pass `client_name`:

```python
@router.patch("/tenants/{tenant_id}/projects/{project_id}")
async def update_project(
    tenant_id: str,
    project_id: str,
    request: ProjectUpdateRequest,
    _claims=Depends(require_admin_claims),
    repository: DashboardRepository = Depends(get_repository),
) -> dict:
    method = require_admin_operation(repository, "update_project")
    try:
        return to_public_dict(
            await method(
                tenant_id, project_id,
                request.name, request.start_date, request.end_date,
                request.client_name,    # NEW
            )
        )
    except ValueError as exc:
        raise NotFoundError(str(exc)) from exc
```

### Frontend changes

**`src/server/admin-api.ts`:**
- Add `client_name: string` to `AdminProject` type
- Add `client_name?: string` to the `adminUpdateProject` data parameter

**`src/app/admin/projects/projects-client.tsx`:**
- Add `client_name` to `DraftState`:
  ```ts
  type DraftState = {
    name: string;
    client_name: string;   // NEW
    start_date: string;
    end_date: string;
  };
  ```
- In `handleEdit`, initialize: `client_name: project.client_name ?? ""`
- Add an input field for Client Name in the edit form (between name and dates):
  ```tsx
  <div className="space-y-1">
    <Label className="text-xs text-muted-foreground">Client Name (shown on dashboard)</Label>
    <Input
      value={draft.client_name}
      onChange={(e) => setDraft((d) => ({ ...d, client_name: e.target.value }))}
      placeholder="e.g. Brasserie Labatt"
      className="max-w-sm"
    />
  </div>
  ```
- In `handleSave`, include `client_name`:
  ```ts
  const updated = await updateProjectAction(tenantId, projectId, {
    name: draft.name.trim() || undefined,
    client_name: draft.client_name.trim() || undefined,  // NEW
    start_date: draft.start_date.trim() || null,
    end_date: draft.end_date.trim() || null,
  });
  ```
- In the non-editing view, show client_name alongside the project name

**`src/app/admin/projects/actions.ts`:**
- Add `client_name` to the `updateProjectAction` data parameter type

## 4. Connection display_name clarifying note

**File:** `src/app/admin/connections/connections-client.tsx`

After the `<h1>` / `<p>` header (around line 71), add:

```tsx
<div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
  <strong>Note:</strong> The display name here is for admin reference only. To change the client
  name shown on dashboard project cards, edit it on the{" "}
  <Link href="/admin/projects" className="underline font-medium">Projects page</Link>.
</div>
```

## 5. Empty metrics sidebar message

**File:** `src/app/dashboard/projects/[projectId]/charts-section.tsx`

In the metrics card body (around line 167, inside `<CardContent>`), add an empty-state check:

```tsx
<CardContent className="space-y-2">
  {metrics.length === 0 ? (
    <p className="text-xs text-slate italic py-4">
      No metrics configured for this project. Add them in Admin → Metrics.
    </p>
  ) : (
    metrics.map((m) => (
      // ... existing metric rows
    ))
  )}
</CardContent>
```

## 6. Red lines

- **Tenant isolation (CLAUDE.md §5.1):** The `update_project` WHERE clause still filters on
  `tenant_id` from JWT claims. Do not accept `tenant_id` from the request body.
- **Thin REST handlers (CLAUDE.md §5.6):** The endpoint stays thin — parse, call repo, shape response.

## 7. Verification gates

```bash
# frontend
npx tsc --noEmit
npm run lint
npm test

# backend
conda activate venv && python -m pytest backend_tests -v

# manual verification (npm run dev + backend running)
# 1. Admin → Projects → Edit a project name → verify visit_count is preserved
# 2. Admin → Projects → Edit client_name → verify it appears on dashboard cards
# 3. Admin → Connections → verify the clarifying note is visible
# 4. Dashboard → project with no metrics → verify empty-state message shows
```

## 8. Definition of done

- [ ] All verification gates green.
- [ ] Editing project name preserves visit_count (not reset to 0).
- [ ] `client_name` field is editable in admin Projects page.
- [ ] Changed client_name appears on dashboard project cards.
- [ ] Connections page shows clarifying note about display_name.
- [ ] Empty metrics sidebar shows "No metrics configured" message.
- [ ] No git operations performed.
