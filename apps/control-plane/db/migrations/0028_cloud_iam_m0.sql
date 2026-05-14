CREATE TYPE "public"."cloud_bootstrap_status" AS ENUM('pending', 'verified', 'broken');--> statement-breakpoint
CREATE TYPE "public"."cloud_connector" AS ENUM('azure', 'aws', 'gcp');--> statement-breakpoint
CREATE TYPE "public"."oidc_key_status" AS ENUM('next', 'active', 'retired');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cloud_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"connector" "cloud_connector" NOT NULL,
	"account_id" text NOT NULL,
	"tenant_id" text,
	"external_id" text NOT NULL,
	"display_name" text,
	"config" jsonb NOT NULL,
	"bootstrap_status" "cloud_bootstrap_status" DEFAULT 'pending' NOT NULL,
	"last_verified_at" timestamp with time zone,
	"last_verify_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oidc_issuer_keys" (
	"kid" text PRIMARY KEY NOT NULL,
	"alg" text NOT NULL,
	"public_jwk" jsonb NOT NULL,
	"kms_key_ref" text NOT NULL,
	"status" "oidc_key_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rotated_at" timestamp with time zone,
	"retired_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cloud_connections" ADD CONSTRAINT "cloud_connections_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cloud_connections_customer_idx" ON "cloud_connections" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cloud_connections_customer_connector_idx" ON "cloud_connections" USING btree ("customer_id","connector");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oidc_issuer_keys_status_idx" ON "oidc_issuer_keys" USING btree ("status");
