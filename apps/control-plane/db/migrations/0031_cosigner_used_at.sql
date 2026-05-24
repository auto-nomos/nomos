-- 0031 — Single-use cosigner enforcement.
--
-- Audit C5 (2026-05-24): cosigner JWTs were validated against
-- push_approvals.cosigner_attestation_jwt by string-match but never marked
-- consumed. A single minted cosigner could be replayed within its TTL window
-- to authorize multiple proxy calls. Fix: track first-use timestamp; the
-- consume endpoint uses atomic CAS so only the first observer wins.

ALTER TABLE push_approvals
  ADD COLUMN IF NOT EXISTS cosigner_used_at TIMESTAMP WITH TIME ZONE;

-- Partial index supports the WHERE clause in the atomic consume UPDATE
-- without bloating the index for the typical rows.
CREATE INDEX IF NOT EXISTS push_approvals_unused_idx
  ON push_approvals (id)
  WHERE cosigner_used_at IS NULL AND state = 'approved';
