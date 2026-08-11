-- Sprint 13a: project-level dashboard layouts (admins edit; all roles read).
-- Idempotent — safe to run against a live DB that already has this table
-- (e.g. via a fresh dashboard_schema.sql apply) as well as one that doesn't.
CREATE TABLE IF NOT EXISTS dashboard.dashboard_layouts (
    tenant_id   TEXT NOT NULL,
    project_id  TEXT NOT NULL,
    layout_json JSONB NOT NULL,
    source      TEXT NOT NULL DEFAULT 'manual',  -- 'manual' | 'ai_suggested' (sprint 14) | 'default'
    updated_by  TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, project_id),
    FOREIGN KEY (tenant_id, project_id)
        REFERENCES dashboard.projects(tenant_id, project_id) ON DELETE CASCADE
);
