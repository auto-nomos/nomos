DO $$ BEGIN
  CREATE TYPE "agent_policies_source" AS ENUM ('manual', 'step_up');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "agent_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
  "agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "policy_id" uuid NOT NULL REFERENCES "policies"("id") ON DELETE CASCADE,
  "source" "agent_policies_source" NOT NULL DEFAULT 'manual',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_by" uuid REFERENCES "user"("id")
);

CREATE INDEX IF NOT EXISTS "agent_policies_agent_idx" ON "agent_policies" ("agent_id");
CREATE INDEX IF NOT EXISTS "agent_policies_policy_idx" ON "agent_policies" ("policy_id");
CREATE UNIQUE INDEX IF NOT EXISTS "agent_policies_agent_policy_uq"
  ON "agent_policies" ("agent_id", "policy_id");

-- Backfill: preserve current behaviour for existing customers by mapping
-- every existing policy to every existing non-deleted agent. New policies
-- and apps created after this migration must be mapped explicitly.
INSERT INTO "agent_policies" ("customer_id", "agent_id", "policy_id", "source", "created_by")
SELECT p."customer_id", a."id", p."id", 'manual', NULL
FROM "policies" p
JOIN "agents" a ON a."customer_id" = p."customer_id"
WHERE a."status" <> 'deleted'
ON CONFLICT ("agent_id", "policy_id") DO NOTHING;
