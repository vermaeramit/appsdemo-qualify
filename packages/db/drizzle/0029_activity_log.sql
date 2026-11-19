CREATE TABLE "activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"lead_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"kind" text NOT NULL,
	"level" text DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "phone_numbers" ADD COLUMN "last_event_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_log_tenant_at_idx" ON "activity_log" USING btree ("tenant_id","at","id");--> statement-breakpoint
CREATE INDEX "activity_log_tenant_source_at_idx" ON "activity_log" USING btree ("tenant_id","source","at","id");--> statement-breakpoint
CREATE INDEX "activity_log_tenant_problems_idx" ON "activity_log" USING btree ("tenant_id","at","id") WHERE "activity_log"."level" <> 'info';--> statement-breakpoint
CREATE INDEX "activity_log_lead_at_idx" ON "activity_log" USING btree ("lead_id","at","id");--> statement-breakpoint
CREATE INDEX "activity_log_at_idx" ON "activity_log" USING btree ("at");