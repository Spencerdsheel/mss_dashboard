ALTER TABLE dashboard.dashboard_layouts ADD COLUMN IF NOT EXISTS page_key TEXT NOT NULL DEFAULT 'overview';
UPDATE dashboard.dashboard_layouts SET page_key = 'overview' WHERE page_key IS NULL OR page_key = '';
ALTER TABLE dashboard.dashboard_layouts DROP CONSTRAINT IF EXISTS dashboard_layouts_pkey;
ALTER TABLE dashboard.dashboard_layouts ADD PRIMARY KEY (tenant_id, project_id, page_key);
