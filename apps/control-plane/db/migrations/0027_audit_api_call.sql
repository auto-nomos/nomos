-- 0027_audit_api_call.sql
-- 2026-05-14 resource_mismatch fix — promote the upstream apiCall target
-- out of the payload jsonb into structured columns. Investigators can now
-- query declared-resource vs effective-path divergence (the Probe-14 class
-- of bug) without scanning jsonb on every row.
--
-- /v1/authorize-only rows leave these columns NULL; /v1/proxy rows always
-- populate both. Length 8 on method matches the longest verb we ship
-- (DELETE = 6, PATCH = 5).

ALTER TABLE "audit_events" ADD COLUMN "api_call_method" varchar(8);
ALTER TABLE "audit_events" ADD COLUMN "api_call_path" text;

-- Backfill from existing payload jsonb where the proxy already wrote the
-- structured fields under payload.apiCall.{method,path}. Safe to re-run.
UPDATE "audit_events"
SET "api_call_method" = "payload"->'apiCall'->>'method',
    "api_call_path"   = "payload"->'apiCall'->>'path'
WHERE "api_call_method" IS NULL
  AND "payload"->'apiCall'->>'path' IS NOT NULL;
