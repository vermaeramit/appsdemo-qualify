-- Tenant isolation for media assets (template header files, D-084).
ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE media_assets FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON media_assets
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
