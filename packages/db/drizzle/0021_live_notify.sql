-- Live updates (D-079): every change to a lead, a message or a lead form submission sends a tiny
-- notification (tenant id, lead id, table) on channel "qualify_live". The api LISTENs and tells
-- that tenant's open dashboards to refetch (through the normal RLS-protected endpoints).
CREATE OR REPLACE FUNCTION notify_live_change() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  lead_ref uuid;
BEGIN
  IF TG_TABLE_NAME = 'leads' THEN
    lead_ref := NEW.id;
  ELSE
    lead_ref := NEW.lead_id;
  END IF;
  PERFORM pg_notify(
    'qualify_live',
    json_build_object('t', NEW.tenant_id, 'l', lead_ref, 'k', TG_TABLE_NAME)::text
  );
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE TRIGGER leads_live AFTER INSERT OR UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION notify_live_change();
--> statement-breakpoint
CREATE TRIGGER messages_live AFTER INSERT OR UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION notify_live_change();
--> statement-breakpoint
CREATE TRIGGER lead_form_submissions_live AFTER INSERT OR UPDATE ON lead_form_submissions
  FOR EACH ROW EXECUTE FUNCTION notify_live_change();
