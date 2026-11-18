-- Backfill messages.pricing from the status webhooks already stored in inbound_meta_events.
-- Runs per tenant with app.tenant_id set, so it also works where RLS is forced on the owner.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT id FROM tenants LOOP
    PERFORM set_config('app.tenant_id', t.id, true);
    UPDATE messages m
    SET pricing = s.pricing
    FROM (
      SELECT DISTINCT ON (st->>'id')
        st->>'id' AS wamid,
        jsonb_strip_nulls(jsonb_build_object(
          'billable', (st->'pricing'->>'billable')::boolean,
          'category', st->'pricing'->>'category',
          'type', st->'pricing'->>'type'
        )) AS pricing
      FROM inbound_meta_events e,
        jsonb_array_elements(e.payload->'entry') en,
        jsonb_array_elements(en->'changes') ch,
        jsonb_array_elements(ch->'value'->'statuses') st
      WHERE st ? 'pricing'
      ORDER BY st->>'id', e.received_at DESC
    ) s
    WHERE m.wa_message_id = s.wamid
      AND m.tenant_id = t.id
      AND m.pricing IS NULL;
  END LOOP;
END $$;
