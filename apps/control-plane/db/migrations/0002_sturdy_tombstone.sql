CREATE TABLE IF NOT EXISTS "audit_roots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"root_event_id" uuid NOT NULL,
	"root_hash" text NOT NULL,
	"signing_key_id" text NOT NULL,
	"signature" text NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_roots" ADD CONSTRAINT "audit_roots_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_roots" ADD CONSTRAINT "audit_roots_root_event_id_audit_events_event_id_fk" FOREIGN KEY ("root_event_id") REFERENCES "public"."audit_events"("event_id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_roots_customer_signed_at_idx" ON "audit_roots" USING btree ("customer_id","signed_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "audit_roots_root_event_idx" ON "audit_roots" USING btree ("root_event_id");