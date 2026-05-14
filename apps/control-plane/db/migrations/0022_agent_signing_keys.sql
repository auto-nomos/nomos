-- Sprint MAOS-A.2 — per-agent Ed25519 signing key, sealed with
-- OAUTH_TOKEN_ENCRYPTION_KEY (xchacha20-poly1305) so the CP can mint
-- *child* UCANs that satisfy validateChain's iss == parent.aud rule.
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "encrypted_signing_key" text;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "signing_key_nonce" text;
