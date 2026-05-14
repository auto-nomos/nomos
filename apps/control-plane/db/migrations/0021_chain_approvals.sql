-- Sprint MAOS-B: swarm-scoped step-up approvals.
-- approved_agent_ids is a snapshot at approval time. Children forked after
-- approval require a fresh approval; never auto-extend.

CREATE TABLE IF NOT EXISTS "agent_chain_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"root_agent_id" uuid NOT NULL,
	"swarm_id" uuid,
	"scope" jsonb NOT NULL,
	"approved_agent_ids" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"approver_email" text NOT NULL,
	"applies_to_current_children_only" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_chain_approvals" ADD CONSTRAINT "agent_chain_approvals_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_chain_approvals_customer_idx" ON "agent_chain_approvals" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_chain_approvals_root_agent_idx" ON "agent_chain_approvals" USING btree ("root_agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_chain_approvals_swarm_idx" ON "agent_chain_approvals" USING btree ("swarm_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_chain_approvals_expires_at_idx" ON "agent_chain_approvals" USING btree ("expires_at");
