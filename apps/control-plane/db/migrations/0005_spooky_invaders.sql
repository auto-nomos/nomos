CREATE TABLE IF NOT EXISTS "envelopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"constraint" jsonb NOT NULL,
	"actions" jsonb NOT NULL,
	"parent_ucan_cid" text,
	"created_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "envelopes" ADD CONSTRAINT "envelopes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "envelopes" ADD CONSTRAINT "envelopes_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "envelopes" ADD CONSTRAINT "envelopes_parent_ucan_cid_ucan_issues_cid_fk" FOREIGN KEY ("parent_ucan_cid") REFERENCES "public"."ucan_issues"("cid") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "envelopes" ADD CONSTRAINT "envelopes_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "envelopes_customer_agent_idx" ON "envelopes" USING btree ("customer_id","agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "envelopes_expires_idx" ON "envelopes" USING btree ("expires_at");