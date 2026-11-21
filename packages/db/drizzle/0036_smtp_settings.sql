CREATE TABLE "smtp_settings" (
	"id" text PRIMARY KEY DEFAULT 'platform' NOT NULL,
	"host" text NOT NULL,
	"port" integer NOT NULL,
	"security" text NOT NULL,
	"username" text,
	"password_enc" text,
	"from_name" text NOT NULL,
	"from_email" text NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "smtp_settings_single_row" CHECK ("smtp_settings"."id" = 'platform')
);
