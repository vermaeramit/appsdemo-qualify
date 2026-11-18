DROP INDEX "leads_tenant_created_idx";--> statement-breakpoint
CREATE INDEX "leads_tenant_score_idx" ON "leads" USING btree ("tenant_id",coalesce("score", -1),"id");--> statement-breakpoint
CREATE INDEX "leads_tenant_created_idx" ON "leads" USING btree ("tenant_id","created_at","id");