-- Files leads send (D-100): tenant isolation, and live updates so an open conversation shows a
-- file as soon as the worker has downloaded it.
ALTER TABLE inbound_media ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE inbound_media FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON inbound_media
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
--> statement-breakpoint
CREATE TRIGGER inbound_media_live AFTER INSERT OR UPDATE ON inbound_media
  FOR EACH ROW EXECUTE FUNCTION notify_live_change();
