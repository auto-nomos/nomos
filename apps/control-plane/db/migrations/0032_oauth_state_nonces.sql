-- 0032 — OAuth state nonce replay cache.
--
-- Audit C2 (2026-05-24): the signed OAuth `state` parameter embeds a fresh
-- 128-bit nonce but the callback never recorded which nonces it had already
-- consumed. Within the 10-minute state TTL the same state value could be
-- replayed (capture from browser history / Referer / proxy logs) and would
-- pass verification, allowing duplicate code exchange / token overwrite
-- races. This table is the one-shot ledger: the connect handler INSERTs
-- sha256(nonce) at sign time; the callback handler CAS-DELETEs after
-- signature verify but before code exchange. Second observation finds the
-- row already gone and is denied as invalid_state.
--
-- Storage uses sha256(nonce) rather than the raw nonce so a snapshot of
-- this table never reveals a usable forge window for in-flight states.

CREATE TABLE IF NOT EXISTS oauth_state_nonces (
  nonce_hash TEXT PRIMARY KEY,
  customer_id UUID NOT NULL,
  connector TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Background sweeper deletes expired rows; this index keeps that scan cheap.
CREATE INDEX IF NOT EXISTS oauth_state_nonces_expires_idx
  ON oauth_state_nonces (expires_at);
