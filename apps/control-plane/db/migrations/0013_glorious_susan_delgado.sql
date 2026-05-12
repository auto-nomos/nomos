CREATE TYPE "public"."grant_decision" AS ENUM('allow', 'deny');--> statement-breakpoint
CREATE TYPE "public"."grant_scope" AS ENUM('exact', 'any');--> statement-breakpoint
CREATE TYPE "public"."risk_score" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"command" text NOT NULL,
	"resource_pattern" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"scope" "grant_scope" DEFAULT 'exact' NOT NULL,
	"decision" "grant_decision" NOT NULL,
	"cedar_snippet" text,
	"risk_summary" text,
	"source_approval_id" uuid,
	"granted_by" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid
);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "step_up_on_deny" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "push_approvals" ADD COLUMN "risk_score" "risk_score";--> statement-breakpoint
ALTER TABLE "push_approvals" ADD COLUMN "risk_summary" text;--> statement-breakpoint
ALTER TABLE "push_approvals" ADD COLUMN "cedar_preview" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_grants" ADD CONSTRAINT "agent_grants_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_grants" ADD CONSTRAINT "agent_grants_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_grants" ADD CONSTRAINT "agent_grants_source_approval_id_push_approvals_id_fk" FOREIGN KEY ("source_approval_id") REFERENCES "public"."push_approvals"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_grants" ADD CONSTRAINT "agent_grants_granted_by_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_grants" ADD CONSTRAINT "agent_grants_revoked_by_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_grants_customer_agent_idx" ON "agent_grants" USING btree ("customer_id","agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_grants_lookup_idx" ON "agent_grants" USING btree ("agent_id","command");