-- AI provider per workspace (D-094): starting prices, existing workspaces keep AppsDemo's key,
-- and tenant isolation for ai_settings and ai_usage.

-- Starting price list (USD per 1M tokens; OpenAI list prices, checked 2026-11-18).
INSERT INTO ai_models (id, label, input_usd, cached_usd, output_usd, enabled, source)
VALUES
  ('gpt-5.4-mini', 'GPT-5.4 mini', 0.75, 0.075, 4.5, true, 'manual'),
  ('gpt-5.4-nano', 'GPT-5.4 nano', 0.2, 0.02, 1.25, true, 'manual'),
  ('gpt-5.5', 'GPT-5.5', 5, 0.5, 30, true, 'manual'),
  ('gpt-4.1-mini', 'GPT-4.1 mini', 0.4, 0.1, 1.6, false, 'manual')
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
-- Workspaces that exist today ran on AppsDemo's key: keep them running (no limit). New
-- workspaces start with the AI off.
INSERT INTO ai_settings (tenant_id, mode)
SELECT id, 'platform' FROM tenants
ON CONFLICT (tenant_id) DO NOTHING;
--> statement-breakpoint
ALTER TABLE ai_settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ai_settings FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON ai_settings
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
--> statement-breakpoint
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ai_usage FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON ai_usage
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
--> statement-breakpoint
-- The usage record is append-only for the app.
REVOKE UPDATE, DELETE ON ai_usage FROM qualify_app;
