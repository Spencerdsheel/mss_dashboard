-- Phase 4: Database Index Migration
-- Run this script to add performance-optimizing indexes
-- Usage: psql -U postgres -d shopmetrics_demo -f scripts/add_indexes.sql

-- Enable pg_stat_statements extension
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Projects: tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_projects_tenant_id
    ON dashboard.projects(tenant_id);

-- Visits: most queried table - multiple indexes for different query patterns
CREATE INDEX IF NOT EXISTS idx_visits_project_date
    ON dashboard.visits(project_id, visit_date);

CREATE INDEX IF NOT EXISTS idx_visits_project_store
    ON dashboard.visits(project_id, store_id);

CREATE INDEX IF NOT EXISTS idx_visits_tenant_project
    ON dashboard.visits(tenant_id, project_id);

-- Visit Photos: photo lookups by project and survey
CREATE INDEX IF NOT EXISTS idx_photos_project_survey
    ON dashboard.visit_photos(project_id, survey_id);

CREATE INDEX IF NOT EXISTS idx_photos_tenant_project
    ON dashboard.visit_photos(tenant_id, project_id);

-- Run Logs: admin queries ordered by started_at
CREATE INDEX IF NOT EXISTS idx_run_logs_tenant_started
    ON dashboard.run_logs(tenant_id, started_at DESC);

-- Provider Connections: connection lookups by tenant
CREATE INDEX IF NOT EXISTS idx_provider_connections_tenant
    ON dashboard.provider_connections(tenant_id);

-- Project Metrics: metrics lookups by tenant and project
CREATE INDEX IF NOT EXISTS idx_metrics_tenant_project
    ON dashboard.project_metrics(tenant_id, project_id);

-- Photo Slot Labels: label lookups by tenant and project
CREATE INDEX IF NOT EXISTS idx_photo_slots_tenant_project
    ON dashboard.photo_slot_labels(tenant_id, project_id);

-- Update statistics for query planner
ANALYZE dashboard.projects;
ANALYZE dashboard.visits;
ANALYZE dashboard.visit_photos;
ANALYZE dashboard.run_logs;
ANALYZE dashboard.provider_connections;
ANALYZE dashboard.project_metrics;
ANALYZE dashboard.photo_slot_labels;

-- Verify indexes were created
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'dashboard'
ORDER BY tablename, indexname;
