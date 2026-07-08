CREATE SCHEMA IF NOT EXISTS dashboard;

CREATE TABLE IF NOT EXISTS dashboard.companies (
    company_id   TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    slug         TEXT NOT NULL UNIQUE,
    status       TEXT NOT NULL DEFAULT 'active',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dashboard.tenants (
    tenant_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    locale TEXT NOT NULL DEFAULT 'fr-CA',
    company_id TEXT REFERENCES dashboard.companies(company_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dashboard.projects (
    tenant_id TEXT NOT NULL REFERENCES dashboard.tenants(tenant_id) ON DELETE CASCADE,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    client_name TEXT NOT NULL,
    provider_kind TEXT NOT NULL DEFAULT 'fake_shopmetrics',
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (tenant_id, project_id)
);

CREATE TABLE IF NOT EXISTS dashboard.raw_rowsets (
    tenant_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    resource_name TEXT NOT NULL,
    rows_json JSONB NOT NULL,
    loaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, project_id, resource_name),
    FOREIGN KEY (tenant_id, project_id)
        REFERENCES dashboard.projects(tenant_id, project_id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dashboard.visits (
    tenant_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    survey_id TEXT NOT NULL,
    store_id TEXT NOT NULL,
    store_name TEXT NOT NULL,
    address TEXT,
    city TEXT,
    visit_date DATE NOT NULL,
    visit_time TEXT,
    clerk_name TEXT,
    install1 TEXT,
    install2 TEXT,
    install3 TEXT,
    install4 TEXT,
    overall_notes TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, project_id, survey_id),
    FOREIGN KEY (tenant_id, project_id)
        REFERENCES dashboard.projects(tenant_id, project_id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dashboard.visit_photos (
    tenant_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    survey_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    url TEXT NOT NULL,
    caption TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, project_id, survey_id, kind, url),
    FOREIGN KEY (tenant_id, project_id, survey_id)
        REFERENCES dashboard.visits(tenant_id, project_id, survey_id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dashboard.project_metrics (
    tenant_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    key TEXT NOT NULL,
    label TEXT NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    unit TEXT,
    category TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, project_id, key),
    FOREIGN KEY (tenant_id, project_id)
        REFERENCES dashboard.projects(tenant_id, project_id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dashboard.provider_connections (
    tenant_id TEXT NOT NULL REFERENCES dashboard.tenants(tenant_id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'fake_shopmetrics',
    status TEXT NOT NULL DEFAULT 'planned',
    display_name TEXT,
    base_url TEXT,
    client_id TEXT,
    client_secret_encrypted TEXT,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, kind)
);

-- Idempotent migration: add display_name to existing databases
ALTER TABLE dashboard.provider_connections ADD COLUMN IF NOT EXISTS display_name TEXT;

CREATE TABLE IF NOT EXISTS dashboard.users (
    user_id TEXT PRIMARY KEY,
    tenant_id TEXT REFERENCES dashboard.tenants(tenant_id) ON DELETE SET NULL,
    company_id TEXT REFERENCES dashboard.companies(company_id),
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    role TEXT NOT NULL,
    project_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    tenant_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    status TEXT NOT NULL DEFAULT 'active',
    hashed_password TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dashboard.run_logs (
    run_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES dashboard.tenants(tenant_id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'manual_refresh',
    status TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    rows_pulled INT NOT NULL DEFAULT 0,
    error_message TEXT,
    details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS dashboard.photo_slot_labels (
    tenant_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    label TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, project_id, kind),
    FOREIGN KEY (tenant_id, project_id)
        REFERENCES dashboard.projects(tenant_id, project_id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dashboard.platform_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default platform settings
INSERT INTO dashboard.platform_settings (key, value)
VALUES ('site_title', 'iSN')
ON CONFLICT (key) DO NOTHING;
INSERT INTO dashboard.platform_settings (key, value)
VALUES ('logo_text', 'iSN')
ON CONFLICT (key) DO NOTHING;
INSERT INTO dashboard.platform_settings (key, value)
VALUES ('footer_text', 'iSN Dashboard')
ON CONFLICT (key) DO NOTHING;
INSERT INTO dashboard.platform_settings (key, value)
VALUES ('brand_color', '#ff682c')
ON CONFLICT (key) DO NOTHING;
INSERT INTO dashboard.platform_settings (key, value)
VALUES ('default_theme', 'system')
ON CONFLICT (key) DO NOTHING;
INSERT INTO dashboard.platform_settings (key, value)
VALUES ('date_format', 'MM/DD/YYYY')
ON CONFLICT (key) DO NOTHING;
INSERT INTO dashboard.platform_settings (key, value)
VALUES ('support_email', '')
ON CONFLICT (key) DO NOTHING;
INSERT INTO dashboard.platform_settings (key, value)
VALUES ('support_url', '')
ON CONFLICT (key) DO NOTHING;
-- P1.4: Per-project campaign model — variable install slots (1–4)
CREATE TABLE IF NOT EXISTS dashboard.project_install_slots (
    tenant_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    slot_index INT NOT NULL CHECK (slot_index BETWEEN 1 AND 4),
    title TEXT NOT NULL,
    question TEXT NOT NULL,
    target INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, project_id, slot_index),
    FOREIGN KEY (tenant_id, project_id)
        REFERENCES dashboard.projects(tenant_id, project_id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dashboard.project_install_categories (
    tenant_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    slot_index INT NOT NULL CHECK (slot_index BETWEEN 1 AND 4),
    position INT NOT NULL,
    label TEXT NOT NULL,
    is_success BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, project_id, slot_index, position),
    FOREIGN KEY (tenant_id, project_id, slot_index)
        REFERENCES dashboard.project_install_slots(tenant_id, project_id, slot_index)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS dashboard_visits_project_date_idx
    ON dashboard.visits(tenant_id, project_id, visit_date);

CREATE INDEX IF NOT EXISTS dashboard_visits_project_city_idx
    ON dashboard.visits(tenant_id, project_id, city);

CREATE INDEX IF NOT EXISTS dashboard_run_logs_tenant_started_idx
    ON dashboard.run_logs(tenant_id, started_at DESC);

-- Groundwork: password-reset tokens
-- Tokens are stored as PBKDF2-SHA256 hashes (never plaintext) and are
-- single-use (consumed_at IS NOT NULL means used) with a hard expiry.
-- The token itself is a cryptographically random URL-safe string issued to
-- the user via a secure out-of-band channel (email, etc.).
CREATE TABLE IF NOT EXISTS dashboard.password_reset_tokens (
    token_id      TEXT PRIMARY KEY,         -- opaque internal ID (uuid)
    user_id       TEXT NOT NULL REFERENCES dashboard.users(user_id) ON DELETE CASCADE,
    tenant_id     TEXT,                     -- denormalised for tenant-aware lookups
    token_hash    TEXT NOT NULL,            -- PBKDF2-SHA256 of the raw token
    expires_at    TIMESTAMPTZ NOT NULL,
    consumed_at   TIMESTAMPTZ,             -- set when token is successfully used
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dashboard_password_reset_user_idx
    ON dashboard.password_reset_tokens(user_id, expires_at DESC);

CREATE OR REPLACE VIEW dashboard.vw_project_summary AS
SELECT
    tenant_id,
    project_id,
    COUNT(*)::INT AS total_visits,
    COUNT(DISTINCT store_id)::INT AS unique_stores,
    MIN(visit_date) AS min_date,
    MAX(visit_date) AS max_date
FROM dashboard.visits
GROUP BY tenant_id, project_id;

CREATE OR REPLACE VIEW dashboard.vw_photo_counts AS
SELECT
    tenant_id,
    project_id,
    kind,
    COUNT(*)::INT AS photo_count
FROM dashboard.visit_photos
GROUP BY tenant_id, project_id, kind;

CREATE OR REPLACE VIEW dashboard.vw_visit_detail AS
SELECT
    v.*,
    COALESCE(COUNT(p.kind), 0)::INT AS photo_count
FROM dashboard.visits v
LEFT JOIN dashboard.visit_photos p
    ON p.tenant_id = v.tenant_id
    AND p.project_id = v.project_id
    AND p.survey_id = v.survey_id
GROUP BY
    v.tenant_id,
    v.project_id,
    v.survey_id,
    v.store_id,
    v.store_name,
    v.address,
    v.city,
    v.visit_date,
    v.visit_time,
    v.clerk_name,
    v.install1,
    v.install2,
    v.install3,
    v.install4,
    v.overall_notes,
    v.updated_at;
