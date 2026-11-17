-- Tenant isolation for playbooks.
ALTER TABLE playbooks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE playbooks FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON playbooks
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
--> statement-breakpoint
ALTER TABLE playbook_versions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE playbook_versions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON playbook_versions
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
