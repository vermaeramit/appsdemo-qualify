ALTER TABLE "leads" ADD COLUMN "score" integer;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "grade" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "score_details" jsonb;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "scored_at" timestamp with time zone;