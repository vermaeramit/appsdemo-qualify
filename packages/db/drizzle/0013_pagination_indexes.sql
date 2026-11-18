CREATE INDEX "lead_form_submissions_tenant_created_idx" ON "lead_form_submissions" USING btree ("tenant_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "leads_tenant_created_idx" ON "leads" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "leads_tenant_activity_idx" ON "leads" USING btree ("tenant_id",coalesce("last_message_at", "created_at") desc,"id");--> statement-breakpoint
CREATE INDEX "leads_tenant_scored_idx" ON "leads" USING btree ("tenant_id","scored_at");--> statement-breakpoint
CREATE INDEX "messages_tenant_created_idx" ON "messages" USING btree ("tenant_id","created_at");