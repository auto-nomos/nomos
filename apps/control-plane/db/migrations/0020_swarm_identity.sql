-- Sprint MAOS-A: multi-agent orchestration security plumbing.
-- Adds:
--   * swarms table (groups agents into a delegation tree, rooted at one agent)
--   * agents.parent_agent_id / root_agent_id / depth / swarm_id (chain identity)
--   * audit_events.parent_receipt_id / swarm_id / chain_depth (causation chain)
--
-- All new agent + audit columns are nullable / default so single-agent flows
-- keep working unchanged. swarms.cross_customer_enabled is a reserved design
-- hook for Phase 2 federation; enforcement stays intra-customer at launch.

CREATE TABLE IF NOT EXISTS "swarms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"root_agent_id" uuid,
	"max_depth" integer,
	"cross_customer_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "swarms" ADD CONSTRAINT "swarms_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "swarms_customer_idx" ON "swarms" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "swarms_root_agent_idx" ON "swarms" USING btree ("root_agent_id");--> statement-breakpoint

ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "parent_agent_id" uuid;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "root_agent_id" uuid;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "depth" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "swarm_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agents" ADD CONSTRAINT "agents_swarm_id_swarms_id_fk" FOREIGN KEY ("swarm_id") REFERENCES "public"."swarms"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_parent_idx" ON "agents" USING btree ("parent_agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_root_idx" ON "agents" USING btree ("root_agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_swarm_idx" ON "agents" USING btree ("swarm_id");--> statement-breakpoint

ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "parent_receipt_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "swarm_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "chain_depth" integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_parent_receipt_idx" ON "audit_events" USING btree ("parent_receipt_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_swarm_idx" ON "audit_events" USING btree ("swarm_id");
