-- Tenant isolation for messaging tables + webhook routing lookup.

ALTER TABLE whatsapp_accounts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE whatsapp_accounts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON whatsapp_accounts
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
--> statement-breakpoint
ALTER TABLE phone_numbers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE phone_numbers FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON phone_numbers
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
--> statement-breakpoint
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE leads FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON leads
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
--> statement-breakpoint
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE messages FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON messages
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
--> statement-breakpoint

-- Webhook routing: Meta tells us the phone_number_id, not the tenant. The worker resolves it
-- through ONE narrow function. It runs as `qualify_router`, a NOLOGIN role that may only read
-- (phone_number_id, tenant_id, status) of phone_numbers. The app role can execute the function
-- but still cannot read phone_numbers outside its tenant.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qualify_router') THEN
    CREATE ROLE qualify_router NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO qualify_router;
--> statement-breakpoint
GRANT SELECT (phone_number_id, tenant_id, status) ON phone_numbers TO qualify_router;
--> statement-breakpoint
CREATE POLICY routing_lookup ON phone_numbers FOR SELECT TO qualify_router USING (true);
--> statement-breakpoint
CREATE FUNCTION resolve_tenant_by_phone_number_id(p_phone_number_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT tenant_id FROM phone_numbers
  WHERE phone_number_id = p_phone_number_id AND status = 'active'
$$;
--> statement-breakpoint
ALTER FUNCTION resolve_tenant_by_phone_number_id(text) OWNER TO qualify_router;
--> statement-breakpoint
REVOKE ALL ON FUNCTION resolve_tenant_by_phone_number_id(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION resolve_tenant_by_phone_number_id(text) TO qualify_app;
