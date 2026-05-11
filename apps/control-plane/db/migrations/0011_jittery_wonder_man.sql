CREATE TABLE IF NOT EXISTS "chain_context_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"task_id" text NOT NULL,
	"session_id" text NOT NULL,
	"fact_type" text NOT NULL,
	"fact_value" text NOT NULL,
	"source_request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chain_context_facts" ADD CONSTRAINT "chain_context_facts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chain_context_facts_task_session_idx" ON "chain_context_facts" USING btree ("customer_id","task_id","session_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chain_context_facts_type_idx" ON "chain_context_facts" USING btree ("customer_id","fact_type");