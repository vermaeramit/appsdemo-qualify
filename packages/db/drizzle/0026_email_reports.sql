CREATE TABLE "email_report_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"report_id" uuid NOT NULL,
	"trigger" text NOT NULL,
	"scheduled_for" timestamp with time zone,
	"period_from" date NOT NULL,
	"period_to" date NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"lead_count" integer,
	"recipients" jsonb NOT NULL,
	"error" text,
	"message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "email_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"recipients" jsonb NOT NULL,
	"frequency" text NOT NULL,
	"send_time" text NOT NULL,
	"weekday" smallint DEFAULT 1 NOT NULL,
	"time_zone" text NOT NULL,
	"grades" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"agent_id" uuid,
	"skip_empty" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_report_runs" ADD CONSTRAINT "email_report_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_report_runs" ADD CONSTRAINT "email_report_runs_report_id_email_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."email_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_reports" ADD CONSTRAINT "email_reports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_reports" ADD CONSTRAINT "email_reports_agent_id_playbooks_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."playbooks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_report_runs_report_created_idx" ON "email_report_runs" USING btree ("tenant_id","report_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_report_runs_slot_uq" ON "email_report_runs" USING btree ("report_id","scheduled_for") WHERE "email_report_runs"."scheduled_for" is not null;--> statement-breakpoint
CREATE INDEX "email_report_runs_queued_idx" ON "email_report_runs" USING btree ("created_at") WHERE "email_report_runs"."status" = 'queued';--> statement-breakpoint
CREATE INDEX "email_reports_due_idx" ON "email_reports" USING btree ("next_run_at") WHERE "email_reports"."enabled";