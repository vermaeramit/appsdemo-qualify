CREATE TABLE "ai_models" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text,
	"input_usd" double precision NOT NULL,
	"cached_usd" double precision NOT NULL,
	"output_usd" double precision NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"prices_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_settings" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"mode" text DEFAULT 'off' NOT NULL,
	"api_key_enc" text,
	"api_key_hint" text,
	"model" text,
	"monthly_limit_usd" double precision,
	"platform_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"lead_id" uuid,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"key_source" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"cached_input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision
);
--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_tenant_at_idx" ON "ai_usage" USING btree ("tenant_id","at");--> statement-breakpoint
CREATE INDEX "ai_usage_tenant_source_at_idx" ON "ai_usage" USING btree ("tenant_id","key_source","at") WHERE "ai_usage"."key_source" = 'platform';