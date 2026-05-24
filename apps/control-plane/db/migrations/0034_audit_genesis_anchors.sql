-- 0034 — Signed-anchor genesis (C3 phase 2).
--
-- Audit C3 phase 1 (0031… landed earlier) pinned each customer's audit
-- genesis to sha256('audit-genesis|v1|<customerId>|<AUDIT_GENESIS_SECRET>')
-- so the universal ZERO_HASH was no longer a forge oracle. Phase 2 raises
-- the bar further: when a customer is created we write a row here, signed
-- by the root audit Ed25519 key. The verifier now requires both:
--
--   1. computed genesis_hash == anchor.genesis_hash
--   2. Ed25519 verify(anchor.signature) over
--        nomos-genesis-anchor|v1|<customerId>|<genesisHash>|<signedAtMs>
--
-- A DB-write attacker can no longer forge a believable first event for an
-- unused customer without also forging a valid signature with the audit
-- root signing key, which lives in the control-plane env only.

CREATE TABLE IF NOT EXISTS audit_genesis_anchors (
  customer_id uuid PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  genesis_hash text NOT NULL,
  signing_key_id text NOT NULL,
  signature text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  signed_at_ms bigint NOT NULL
);
