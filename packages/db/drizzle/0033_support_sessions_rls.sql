-- Support access (D-092): tenant isolation, and an audit record the app can't rewrite.
ALTER TABLE support_sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE support_sessions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON support_sessions
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
--> statement-breakpoint
-- The app opens, ends and notes viewed conversations; it never deletes or rewrites a record.
REVOKE UPDATE, DELETE ON support_sessions FROM qualify_app;
--> statement-breakpoint
GRANT UPDATE (ended_at, viewed_lead_ids) ON support_sessions TO qualify_app;
