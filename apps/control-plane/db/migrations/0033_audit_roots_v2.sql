-- 0033 — Audit root signature v2 (per-customer + timestamp binding).
--
-- Audit H7 (2026-05-24): the Ed25519 signature on audit_roots covered only
-- the UTF-8 bytes of `root_hash`. A DB-write attacker could move a valid
-- signature from one customer's row to another's; the verifier would accept
-- it because the customer_id and signed_at fields were not part of the
-- signed message. v2 signs a canonical envelope:
--
--   nomos-audit-root|v2|<customer_id>|<root_hash>|<signed_at_ms>
--
-- `signature_version` lets the verifier dispatch on the old (v1) format for
-- rows signed before this migration. `signed_at_ms` pins the exact ms-since-
-- epoch used in the v2 canonical message; relying on signed_at_ISO round-trip
-- would lose us microsecond information and fail-verify-on-rewrite later.

ALTER TABLE audit_roots
  ADD COLUMN IF NOT EXISTS signature_version integer NOT NULL DEFAULT 1;

ALTER TABLE audit_roots
  ADD COLUMN IF NOT EXISTS signed_at_ms bigint;
