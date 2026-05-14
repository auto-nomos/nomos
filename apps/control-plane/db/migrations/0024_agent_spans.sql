-- Observability v2 — per-tool-call execution telemetry.
-- One row per MCP tool invocation, written after the upstream returns.
-- Privacy: hashes + tiny allowlisted summary; never raw bodies.

CREATE TABLE IF NOT EXISTS "agent_spans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"swarm_id" uuid,
	"agent_id" uuid NOT NULL,
	"receipt_id" text NOT NULL,
	"parent_span_id" uuid,
	"tool_name" text NOT NULL,
	"status" text NOT NULL,
	"http_status" integer,
	"error_code" text,
	"error_message" text,
	"request_args_hash" text NOT NULL,
	"request_summary" jsonb,
	"response_hash" text,
	"response_summary" jsonb,
	"next_agent_hint" text,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"latency_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_spans" ADD CONSTRAINT "agent_spans_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_spans" ADD CONSTRAINT "agent_spans_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_spans_customer_swarm_created_at_idx" ON "agent_spans" USING btree ("customer_id","swarm_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_spans_receipt_idx" ON "agent_spans" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_spans_parent_idx" ON "agent_spans" USING btree ("parent_span_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_spans_customer_receipt_uq" ON "agent_spans" USING btree ("customer_id","receipt_id");
