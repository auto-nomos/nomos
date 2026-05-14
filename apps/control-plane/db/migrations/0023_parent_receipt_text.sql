-- Sprint MAOS-A.3 — `parent_receipt_id` was modeled as uuid because the
-- design assumed event_id (also uuid) would be the back-link target. In
-- practice the SDK / agent only sees `decision.receiptId` (sha256Hex of
-- the canonical decision payload), which is what they pass back as
-- parent_receipt_id on the next call. Widen the column to text so those
-- inserts succeed; the audit_events.parent_receipt_idx index continues
-- to work for tree walks.
ALTER TABLE "audit_events"
  ALTER COLUMN "parent_receipt_id" TYPE text USING "parent_receipt_id"::text;
