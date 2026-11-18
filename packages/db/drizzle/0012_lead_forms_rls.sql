-- Tenant isolation for lead form tables + Page → tenant lookup for leadgen webhooks (D-036 pattern).
ALTER TABLE facebook_pages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE facebook_pages FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON facebook_pages
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
--> statement-breakpoint
ALTER TABLE lead_form_submissions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE lead_form_submissions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON lead_form_submissions
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
--> statement-breakpoint
ALTER TABLE lead_form_mappings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE lead_form_mappings FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON lead_form_mappings
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
--> statement-breakpoint
-- Meta's leadgen webhook names the Page, not the tenant. The worker resolves it through ONE
-- narrow function owned by qualify_router, which may only read (page_id, tenant_id, status).
GRANT SELECT (page_id, tenant_id, status) ON facebook_pages TO qualify_router;
--> statement-breakpoint
CREATE POLICY routing_lookup ON facebook_pages FOR SELECT TO qualify_router USING (true);
--> statement-breakpoint
CREATE FUNCTION resolve_tenant_by_page_id(p_page_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT tenant_id FROM facebook_pages WHERE page_id = p_page_id AND status = 'active'
$$;
--> statement-breakpoint
ALTER FUNCTION resolve_tenant_by_page_id(text) OWNER TO qualify_router;
--> statement-breakpoint
REVOKE ALL ON FUNCTION resolve_tenant_by_page_id(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION resolve_tenant_by_page_id(text) TO qualify_app;
