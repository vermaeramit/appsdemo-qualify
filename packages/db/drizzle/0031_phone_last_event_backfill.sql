-- D-091: phone_numbers.last_event_at starts empty, which would make every number with a recent
-- outgoing message look "silent" until Meta's next webhook. Fill it from the raw webhook log
-- (each delivery names its phone_number_id in entry[].changes[].value.metadata).
UPDATE phone_numbers p
   SET last_event_at = latest.received_at
  FROM (
    SELECT change -> 'value' -> 'metadata' ->> 'phone_number_id' AS phone_number_id,
           max(e.received_at) AS received_at
      FROM inbound_meta_events e
     CROSS JOIN LATERAL jsonb_array_elements(coalesce(e.payload -> 'entry', '[]'::jsonb)) AS entry
     CROSS JOIN LATERAL jsonb_array_elements(coalesce(entry -> 'changes', '[]'::jsonb)) AS change
     WHERE e.object = 'whatsapp_business_account'
     GROUP BY 1
  ) AS latest
 WHERE latest.phone_number_id = p.phone_number_id
   AND p.last_event_at IS NULL;
