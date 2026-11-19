-- Scheduled e-mail reports (D-088): tenant isolation, schedule math, and the due-work lookup.
ALTER TABLE email_reports ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE email_reports FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON email_reports
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
--> statement-breakpoint
ALTER TABLE email_report_runs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE email_report_runs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON email_report_runs
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
--> statement-breakpoint
-- The next send time strictly after p_after: daily at HH:MM, weekly on an ISO weekday, or monthly
-- on the 1st, in the report's time zone (Postgres resolves daylight saving).
CREATE FUNCTION next_email_report_run(
  p_frequency text,
  p_weekday integer,
  p_send_time text,
  p_tz text,
  p_after timestamptz
) RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  local_day date := (p_after AT TIME ZONE p_tz)::date;
  at_time time := p_send_time::time;
  run_day date;
  candidate timestamptz;
BEGIN
  IF p_frequency = 'daily' THEN
    run_day := local_day;
    candidate := (run_day + at_time) AT TIME ZONE p_tz;
    IF candidate <= p_after THEN
      candidate := ((run_day + 1) + at_time) AT TIME ZONE p_tz;
    END IF;
  ELSIF p_frequency = 'weekly' THEN
    run_day := local_day + ((p_weekday - extract(isodow FROM local_day)::integer + 7) % 7);
    candidate := (run_day + at_time) AT TIME ZONE p_tz;
    IF candidate <= p_after THEN
      candidate := ((run_day + 7) + at_time) AT TIME ZONE p_tz;
    END IF;
  ELSE
    run_day := date_trunc('month', local_day)::date;
    candidate := (run_day + at_time) AT TIME ZONE p_tz;
    IF candidate <= p_after THEN
      candidate := ((run_day + interval '1 month')::date + at_time) AT TIME ZONE p_tz;
    END IF;
  END IF;
  RETURN candidate;
END;
$$;
--> statement-breakpoint
-- The local days a run covers. A scheduled run covers the last full period before the day it
-- goes out (yesterday, the 7 days before, last month); "Send now" covers the current period so
-- far (today, the last 7 days, this month).
CREATE FUNCTION email_report_period(
  p_frequency text,
  p_tz text,
  p_at timestamptz,
  p_so_far boolean
) RETURNS TABLE (period_from date, period_to date)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH d AS (SELECT (p_at AT TIME ZONE p_tz)::date AS day)
  SELECT
    CASE
      WHEN p_so_far AND p_frequency = 'daily' THEN d.day
      WHEN p_so_far AND p_frequency = 'weekly' THEN d.day - 6
      WHEN p_so_far THEN date_trunc('month', d.day)::date
      WHEN p_frequency = 'daily' THEN d.day - 1
      WHEN p_frequency = 'weekly' THEN d.day - 7
      ELSE (date_trunc('month', d.day) - interval '1 month')::date
    END,
    CASE
      WHEN p_so_far THEN d.day
      WHEN p_frequency = 'monthly' THEN date_trunc('month', d.day)::date - 1
      ELSE d.day - 1
    END
  FROM d
$$;
--> statement-breakpoint
-- The worker's minute tick needs due reports (and runs whose job was lost) across tenants. It
-- reads them through ONE narrow function owned by qualify_router (D-036 pattern), which may only
-- see ids, tenant ids and the scheduling columns.
GRANT SELECT (id, tenant_id, enabled, next_run_at) ON email_reports TO qualify_router;
--> statement-breakpoint
CREATE POLICY routing_lookup ON email_reports FOR SELECT TO qualify_router USING (true);
--> statement-breakpoint
GRANT SELECT (id, tenant_id, status, created_at) ON email_report_runs TO qualify_router;
--> statement-breakpoint
CREATE POLICY routing_lookup ON email_report_runs FOR SELECT TO qualify_router USING (true);
--> statement-breakpoint
CREATE FUNCTION due_email_report_work(p_limit integer)
RETURNS TABLE (kind text, tenant_id text, id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  (SELECT 'report'::text, r.tenant_id, r.id
     FROM email_reports r
    WHERE r.enabled AND r.next_run_at <= now()
    ORDER BY r.next_run_at
    LIMIT p_limit)
  UNION ALL
  (SELECT 'run'::text, q.tenant_id, q.id
     FROM email_report_runs q
    WHERE q.status = 'queued' AND q.created_at < now() - interval '10 minutes'
    ORDER BY q.created_at
    LIMIT p_limit)
$$;
--> statement-breakpoint
ALTER FUNCTION due_email_report_work(integer) OWNER TO qualify_router;
--> statement-breakpoint
REVOKE ALL ON FUNCTION due_email_report_work(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION due_email_report_work(integer) TO qualify_app;
