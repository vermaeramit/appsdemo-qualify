-- Activity log (D-091): tenant isolation, live updates, and retention pruning.
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE activity_log FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON activity_log
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
--> statement-breakpoint
-- Open dashboards refresh a lead's timeline and the Logs page as entries arrive (D-079).
CREATE TRIGGER activity_log_live AFTER INSERT ON activity_log
  FOR EACH ROW EXECUTE FUNCTION notify_live_change();
--> statement-breakpoint
-- Retention: the worker deletes old entries across tenants through ONE narrow function owned by
-- qualify_router (D-036 pattern). qualify_router may only see and delete rows older than 7 days,
-- so even a wrong argument can't touch recent activity.
GRANT SELECT (id, at) ON activity_log TO qualify_router;
--> statement-breakpoint
GRANT DELETE ON activity_log TO qualify_router;
--> statement-breakpoint
CREATE POLICY retention_read ON activity_log FOR SELECT TO qualify_router
  USING (at < now() - interval '7 days');
--> statement-breakpoint
CREATE POLICY retention_prune ON activity_log FOR DELETE TO qualify_router
  USING (at < now() - interval '7 days');
--> statement-breakpoint
CREATE FUNCTION prune_activity_log(p_days integer, p_limit integer)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  removed integer;
BEGIN
  IF p_days < 7 THEN
    RAISE EXCEPTION 'activity retention must be at least 7 days';
  END IF;
  DELETE FROM activity_log
   WHERE id IN (
     SELECT id FROM activity_log
      WHERE at < now() - make_interval(days => p_days)
      ORDER BY at
      LIMIT p_limit
   );
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END
$$;
--> statement-breakpoint
ALTER FUNCTION prune_activity_log(integer, integer) OWNER TO qualify_router;
--> statement-breakpoint
REVOKE ALL ON FUNCTION prune_activity_log(integer, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION prune_activity_log(integer, integer) TO qualify_app;
