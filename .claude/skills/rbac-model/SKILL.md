---
name: rbac-model
description: Use when implementing or reviewing roles, permissions, or access checks in this dashboard — the ADMIN/CLIENT roles, JWT claims shape, single-admin principle, tenant + project scoping in repository queries, frontend defense-in-depth, user lifecycle, and the RBAC test matrix. Source: knowledge_base/RBAC_MODEL.md.
---

# RBAC Model

Strict multi-tenant RBAC: tenant isolation, least privilege, **single admin**, audit separation.

## Roles
- **ADMIN** (`admin@demo.local`, `tenant_id = NULL`, empty `project_ids` = all): all tenants,
  all projects, `/admin/*`, user mgmt, refresh, run logs. **Only one admin should exist in prod.**
- **CLIENT** (`tenant_id` required, `project_ids` required): only their tenant + assigned projects;
  `/admin/*` → 403; cannot manage users / refresh / view run logs.

## JWT claims
`{ sub, email, role, tenant_id, project_ids }`. `tenant_id` is `null` for ADMIN. Authorization is
a **filter** (filter by accessible `project_ids`), not just a gate.

## Enforcement (data layer is the primary boundary)
```python
if claims.role == Role.ADMIN:        # all projects
if claims.tenant_id is None or not claims.project_ids: return []   # client w/o scope
SELECT * FROM dashboard.projects WHERE tenant_id = %s AND project_id = ANY(%s)
```
Every dashboard table carries `tenant_id`. Backend extracts JWT → validates → checks role/tenant
**before** querying; **never trusts a client-provided tenant_id**. Frontend is defense-in-depth:
`src/server/rbac.ts` `assertProjectAccess()` redirects on mismatch; tokens stay server-side
(RSC + server actions read the `auth_token` cookie, never expose it to the client).

## User lifecycle
Admin creates CLIENT users via `/admin/users` with explicit tenant + projects. Creating another
ADMIN requires approval + audit + deletion after use — prefer CLIENT with elevated projects.

## Test matrix (must pass)
- CLIENT A → CLIENT B's project = **403**.
- ADMIN `/projects` = all projects.
- CLIENT `/projects` = only assigned (e.g. exactly 1: `project_messi_flying_fish`, `tenant_labatt`).
- CLIENT `/admin/*` = 403.

**Full detail:** `knowledge_base/RBAC_MODEL.md`. Rule: `.claude/rules/tenant-isolation.md`.
