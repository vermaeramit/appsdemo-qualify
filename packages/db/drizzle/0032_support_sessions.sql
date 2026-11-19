CREATE TABLE "support_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"admin_user_id" text NOT NULL,
	"admin_name" text NOT NULL,
	"admin_email" text NOT NULL,
	"auth_session_id" text NOT NULL,
	"return_workspace_id" text,
	"reason" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"ip_address" text,
	"user_agent" text,
	"viewed_lead_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL
);
--> statement-breakpoint
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_sessions_tenant_started_idx" ON "support_sessions" USING btree ("tenant_id","started_at");--> statement-breakpoint
CREATE INDEX "support_sessions_auth_session_idx" ON "support_sessions" USING btree ("tenant_id","auth_session_id");