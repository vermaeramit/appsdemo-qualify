DROP INDEX "lead_form_submissions_tenant_created_idx";--> statement-breakpoint
DROP INDEX "leads_tenant_activity_idx";--> statement-breakpoint
DROP INDEX "messages_tenant_lead_created_idx";--> statement-breakpoint
CREATE INDEX "lead_form_submissions_tenant_created_idx" ON "lead_form_submissions" USING btree ("tenant_id","created_at","id");--> statement-breakpoint
CREATE INDEX "leads_tenant_activity_idx" ON "leads" USING btree ("tenant_id",coalesce("last_message_at", "created_at"),"id");--> statement-breakpoint
CREATE INDEX "messages_tenant_lead_created_idx" ON "messages" USING btree ("tenant_id","lead_id","created_at","id");