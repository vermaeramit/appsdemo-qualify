-- Live updates also on deletes (D-085): a deleted lead or form submission disappears from open
-- dashboards right away. Messages are left out (a cascade would notify once per message).
CREATE OR REPLACE FUNCTION notify_live_change() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  rec record;
  lead_ref uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    rec := OLD;
  ELSE
    rec := NEW;
  END IF;
  IF TG_TABLE_NAME = 'leads' THEN
    lead_ref := rec.id;
  ELSE
    lead_ref := rec.lead_id;
  END IF;
  PERFORM pg_notify(
    'qualify_live',
    json_build_object('t', rec.tenant_id, 'l', lead_ref, 'k', TG_TABLE_NAME)::text
  );
  RETURN NULL;
END
$$;
--> statement-breakpoint
DROP TRIGGER leads_live ON leads;
--> statement-breakpoint
CREATE TRIGGER leads_live AFTER INSERT OR UPDATE OR DELETE ON leads
  FOR EACH ROW EXECUTE FUNCTION notify_live_change();
--> statement-breakpoint
DROP TRIGGER lead_form_submissions_live ON lead_form_submissions;
--> statement-breakpoint
CREATE TRIGGER lead_form_submissions_live AFTER INSERT OR UPDATE OR DELETE ON lead_form_submissions
  FOR EACH ROW EXECUTE FUNCTION notify_live_change();
