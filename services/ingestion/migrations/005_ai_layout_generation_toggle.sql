-- Sprint 19: platform-admin toggle for "Generate overview page (AI)".
-- Idempotent — safe to run against a live DB that already has this row
-- (e.g. via a fresh dashboard_schema.sql apply) as well as one that doesn't.
-- Seeded 'true' (capability generally available by default) -- an admin who
-- wants it off makes an active choice to disable, per spec §5.3.
INSERT INTO dashboard.platform_settings (key, value)
VALUES ('ai_layout_generation_enabled', 'true')
ON CONFLICT (key) DO NOTHING;
