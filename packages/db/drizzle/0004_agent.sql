CREATE TABLE "playbook_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"playbook_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"status" text NOT NULL,
	"config" jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playbooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"template_key" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "playbook_version_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "fields" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ai_paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "signals" jsonb;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "last_inbound_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "qualified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "handoff_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "playbook_versions" ADD CONSTRAINT "playbook_versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_versions" ADD CONSTRAINT "playbook_versions_playbook_id_playbooks_id_fk" FOREIGN KEY ("playbook_id") REFERENCES "public"."playbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbooks" ADD CONSTRAINT "playbooks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "playbook_versions_no_uq" ON "playbook_versions" USING btree ("playbook_id","version_no");--> statement-breakpoint
CREATE UNIQUE INDEX "playbooks_one_default_per_tenant" ON "playbooks" USING btree ("tenant_id") WHERE "playbooks"."is_default";--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_playbook_version_id_playbook_versions_id_fk" FOREIGN KEY ("playbook_version_id") REFERENCES "public"."playbook_versions"("id") ON DELETE set null ON UPDATE no action;