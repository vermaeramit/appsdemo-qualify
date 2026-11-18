CREATE TABLE "facebook_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"page_id" text NOT NULL,
	"name" text NOT NULL,
	"access_token_enc" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "facebook_pages_page_id_unique" UNIQUE("page_id")
);
--> statement-breakpoint
CREATE TABLE "lead_form_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"form_id" text NOT NULL,
	"form_name" text,
	"mapping" jsonb NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_form_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"leadgen_id" text NOT NULL,
	"page_id" text NOT NULL,
	"form_id" text NOT NULL,
	"ad_id" text,
	"lead_id" uuid,
	"field_data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_form_submissions_leadgen_id_unique" UNIQUE("leadgen_id")
);
--> statement-breakpoint
ALTER TABLE "facebook_pages" ADD CONSTRAINT "facebook_pages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_form_mappings" ADD CONSTRAINT "lead_form_mappings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_form_submissions" ADD CONSTRAINT "lead_form_submissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_form_submissions" ADD CONSTRAINT "lead_form_submissions_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lead_form_mappings_form_uq" ON "lead_form_mappings" USING btree ("tenant_id","form_id");--> statement-breakpoint
CREATE INDEX "lead_form_submissions_tenant_form_idx" ON "lead_form_submissions" USING btree ("tenant_id","form_id");