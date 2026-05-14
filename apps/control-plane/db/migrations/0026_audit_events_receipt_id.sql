-- 0026_audit_events_receipt_id.sql
-- Promote decision.receiptId out of the payload jsonb into a queryable column
-- so observability span ingestion can correlate a span to its authorize-receipt
-- in O(1) instead of a jsonb scan, and so existing audit_events rows can be
-- backfilled for historical traffic.
--
-- decision.receiptId is a sha256 hex string (NOT the row's event_id uuid).
-- We never had a place to lookup by it before; spans wired in 0024 assumed
-- event_id text-equals receiptId, which is impossible because event_id is
-- uuid. This column fixes that drift.

ALTER TABLE "audit_events" ADD COLUMN "receipt_id" text;

-- Backfill from existing payload jsonb. Safe to re-run.
UPDATE "audit_events"
SET "receipt_id" = "payload"->'decision'->>'receiptId'
WHERE "receipt_id" IS NULL
  AND "payload"->'decision'->>'receiptId' IS NOT NULL;

CREATE INDEX IF NOT EXISTS "audit_events_customer_receipt_id_idx"
  ON "audit_events" ("customer_id", "receipt_id");
