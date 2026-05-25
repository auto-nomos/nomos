-- 0035_agent_spans_handoff.sql
-- P1 — structured handoff capture. Adds four nullable columns + a schema
-- version + a partial index to agent_spans. Hand-written (per project
-- convention, see 0025/0026) to avoid regenerating an unrelated snapshot
-- and to keep the _journal `when` strictly monotonic.

ALTER TABLE "agent_spans" ADD COLUMN "handoff_to_did" text;
ALTER TABLE "agent_spans" ADD COLUMN "handoff_task" text;
ALTER TABLE "agent_spans" ADD COLUMN "handoff_expected_output" text;
ALTER TABLE "agent_spans" ADD COLUMN "handoff_rationale" text;
ALTER TABLE "agent_spans" ADD COLUMN "handoff_schema_version" smallint NOT NULL DEFAULT 1;

CREATE INDEX "agent_spans_handoff_to_did_idx"
  ON "agent_spans" ("customer_id", "swarm_id", "handoff_to_did")
  WHERE "handoff_to_did" IS NOT NULL;
