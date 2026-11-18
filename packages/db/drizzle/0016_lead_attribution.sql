ALTER TABLE "leads" ADD COLUMN "attribution" jsonb;--> statement-breakpoint
-- Backfill attribution from stored lead form submissions and CTWA referrals (latest per lead).
-- Runs per tenant with app.tenant_id set, so it also works where RLS is forced on the owner.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT id FROM tenants LOOP
    PERFORM set_config('app.tenant_id', t.id, true);
    UPDATE leads l
    SET attribution = jsonb_strip_nulls(jsonb_build_object(
      'channel', 'meta_form',
      'at', to_char(s.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'formId', s.form_id,
      'formName', left(m.form_name, 200),
      'adId', s.ad_id,
      'pageId', s.page_id
    ))
    FROM (
      SELECT DISTINCT ON (lead_id) lead_id, tenant_id, form_id, ad_id, page_id, created_at
      FROM lead_form_submissions
      WHERE lead_id IS NOT NULL
      ORDER BY lead_id, created_at DESC
    ) s
    LEFT JOIN lead_form_mappings m ON m.tenant_id = s.tenant_id AND m.form_id = s.form_id
    WHERE s.lead_id = l.id AND l.attribution IS NULL;

    UPDATE leads l
    SET attribution = jsonb_strip_nulls(jsonb_build_object(
      'channel', 'ctwa',
      'at', to_char(x.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'adId', CASE WHEN x.r->>'source_type' = 'ad' THEN left(x.r->>'source_id', 64) END,
      'sourceType', left(x.r->>'source_type', 32),
      'sourceUrl', left(x.r->>'source_url', 1000),
      'headline', left(x.r->>'headline', 300),
      'body', left(x.r->>'body', 1000),
      'ctwaClid', left(x.r->>'ctwa_clid', 500)
    ))
    FROM (
      SELECT DISTINCT ON (lead_id) lead_id, created_at, payload->'referral' AS r
      FROM messages
      WHERE direction = 'inbound' AND payload ? 'referral'
      ORDER BY lead_id, created_at DESC
    ) x
    WHERE x.lead_id = l.id AND l.attribution IS NULL;
  END LOOP;
END $$;
