-- Tenant isolation (see docs/ARCHITECTURE.md §4.2).
--
-- The api and worker connect as `qualify_app` (or a login role that is a member of it).
-- Migrations run as the database owner. RLS policies read the tenant from
-- current_setting('app.tenant_id', true), which withTenant() sets per transaction.
-- Outside withTenant() it is NULL, so tenant tables return no rows (fail closed).
--
-- Production: create `qualify_app` WITH LOGIN and a strong password BEFORE running migrations.
-- Local dev: deploy/dev/postgres-init.sql creates it. If it doesn't exist, create it NOLOGIN.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qualify_app') THEN
    CREATE ROLE qualify_app NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO qualify_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO qualify_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO qualify_app;
--> statement-breakpoint
-- Tables created by later migrations (same owner) get the same grants automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO qualify_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO qualify_app;
--> statement-breakpoint
-- Partners are managed by the platform, read-only for the app.
REVOKE INSERT, UPDATE, DELETE ON partners FROM qualify_app;
--> statement-breakpoint
INSERT INTO partners (id, name, type) VALUES ('default', 'Default', 'default') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenants
  USING (id = current_setting('app.tenant_id', true))
  WITH CHECK (id = current_setting('app.tenant_id', true));
--> statement-breakpoint
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON audit_logs
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
