-- Sprint 07b rev2: Add tenant_ids array column for multi-tenant CLIENT_ADMIN support
ALTER TABLE dashboard.users ADD COLUMN IF NOT EXISTS tenant_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill: copy existing single tenant_id into tenant_ids array
UPDATE dashboard.users
SET tenant_ids = ARRAY[tenant_id]
WHERE tenant_id IS NOT NULL
  AND (tenant_ids IS NULL OR array_length(tenant_ids, 1) IS NULL);
