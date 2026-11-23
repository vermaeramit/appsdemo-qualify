CREATE TABLE "inbound_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"lead_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"wa_media_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"mime" text,
	"file_name" text,
	"size" integer,
	"sha256" text,
	"bytes" "bytea",
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inbound_media_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
ALTER TABLE "inbound_media" ADD CONSTRAINT "inbound_media_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_media" ADD CONSTRAINT "inbound_media_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_media" ADD CONSTRAINT "inbound_media_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inbound_media_tenant_created_idx" ON "inbound_media" USING btree ("tenant_id","created_at") WHERE "inbound_media"."status" = 'stored';