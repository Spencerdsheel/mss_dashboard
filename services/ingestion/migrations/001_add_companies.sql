-- Sprint 07a: Add companies table and link to tenants/users
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS dashboard.companies (
    company_id   TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    slug         TEXT NOT NULL UNIQUE,
    status       TEXT NOT NULL DEFAULT 'active',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add company_id FK to tenants and users
ALTER TABLE dashboard.tenants
    ADD COLUMN IF NOT EXISTS company_id TEXT REFERENCES dashboard.companies(company_id);

ALTER TABLE dashboard.users
    ADD COLUMN IF NOT EXISTS company_id TEXT REFERENCES dashboard.companies(company_id);

-- Seed a default company for existing data
INSERT INTO dashboard.companies (company_id, name, slug)
VALUES ('company_default', 'Default Company', 'default')
ON CONFLICT DO NOTHING;

-- Assign existing tenants to the default company
UPDATE dashboard.tenants SET company_id = 'company_default' WHERE company_id IS NULL;

-- Migrate existing roles:
--   ADMIN -> PLATFORM_ADMIN
--   CLIENT -> TENANT_USER
UPDATE dashboard.users SET role = 'PLATFORM_ADMIN' WHERE role = 'ADMIN';
UPDATE dashboard.users SET role = 'TENANT_USER' WHERE role = 'CLIENT';

-- Assign CLIENT_ADMIN-eligible users a company_id
-- (All TENANT_USERs get the default company via their tenant)
UPDATE dashboard.users u
SET company_id = t.company_id
FROM dashboard.tenants t
WHERE u.tenant_id = t.tenant_id AND u.company_id IS NULL;
