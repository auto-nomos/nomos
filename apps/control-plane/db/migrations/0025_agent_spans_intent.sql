-- 0025_agent_spans_intent.sql
-- Add optional intent column to agent_spans for the narrative layer
-- (agent-declared "why I'm calling this tool"). Hand-written, not
-- drizzle-generated, to avoid regenerating an unrelated 0024 snapshot
-- (per project history; see project_d1_resolved / journal monotonic invariant).

ALTER TABLE "agent_spans" ADD COLUMN "intent" text;
