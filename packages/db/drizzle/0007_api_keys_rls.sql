-- Tenant isolation for API keys + key → tenant lookup (same pattern as phone-number routing, D-036).
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON api_keys
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
--> statement-breakpoint
-- The api resolves an incoming key's hash to its tenant through ONE narrow function owned by
-- qualify_router, which may only read (key_hash, tenant_id, revoked_at).
GRANT SELECT (key_hash, tenant_id, revoked_at) ON api_keys TO qualify_router;
--> statement-breakpoint
CREATE POLICY api_key_lookup ON api_keys FOR SELECT TO qualify_router USING (true);
--> statement-breakpoint
CREATE FUNCTION resolve_tenant_by_api_key_hash(p_key_hash text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT tenant_id FROM api_keys WHERE key_hash = p_key_hash AND revoked_at IS NULL
$$;
--> statement-breakpoint
ALTER FUNCTION resolve_tenant_by_api_key_hash(text) OWNER TO qualify_router;
--> statement-breakpoint
REVOKE ALL ON FUNCTION resolve_tenant_by_api_key_hash(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION resolve_tenant_by_api_key_hash(text) TO qualify_app;
