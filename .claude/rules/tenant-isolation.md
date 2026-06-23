# Rule: Tenant Isolation

Multi-tenancy is **mandatory, not optional**. Every row, query, and token is scoped to a tenant.

## Must

- `tenant_id` is derived **only** from verified JWT claims. Never accept it from query strings,
  request bodies, route/path params, or headers — those are user-controlled.
- Every database-layer function takes an explicit tenant context argument and filters on it.
  There is no "global" read path except explicit ADMIN-role operations.
- JWT claims carry `sub`, `tenant_id`, `role`, `project_ids`. CLIENT users may only access
  projects in their own `tenant_id` **and** their `project_ids`. ADMIN may cross tenants only
  after an explicit role check.
- `tenant_id` is established at ingestion time and is immutable thereafter.

## Must not

- Do not add a code path where `tenant_id` flows in from the request.
- Do not "optimize" by caching cross-tenant data in a shared, unkeyed cache entry.
- Do not return data for a tenant the caller's JWT does not authorize.

## Where this lives

`services/common/postgres_repository.py`, `services/common/tenancy.py`,
`services/common/security.py` (JWT), the REST route guards in `services/api/routes/`.

## Verify

A CLIENT token for tenant A requesting a tenant-B project gets 403/404, never B's data.
