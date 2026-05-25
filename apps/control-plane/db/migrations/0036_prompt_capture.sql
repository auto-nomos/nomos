-- 0036_prompt_capture.sql
-- P2 — prompt + reasoning capture (opt-in, encrypted at rest).
-- Two new tables:
--   agent_span_prompts             — ciphertext + nonce + redaction findings
--                                    keyed by span_id, FK cascade on customer.
--   customer_observability_config  — per-customer toggle, sample rate,
--                                    retention, KMS key ARN, ToS version.
-- Hand-written (per project convention; see 0025/0035) to dodge a
-- regenerated snapshot and keep journal `when` monotonic.

CREATE TABLE "agent_span_prompts" (
  "span_id"                       uuid PRIMARY KEY REFERENCES "agent_spans"("id") ON DELETE CASCADE,
  "customer_id"                   uuid NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
  "prompt_ciphertext_hex"         text NOT NULL,
  "prompt_nonce_hex"              text NOT NULL,
  "prompt_aad_kind"               text NOT NULL DEFAULT 'span_v1',
  "reasoning_ciphertext_hex"      text,
  "reasoning_nonce_hex"           text,
  -- Owner-only raw side for incident response. Same AEAD key + AAD;
  -- separate columns so a SQL-level leak of the redacted side does
  -- not also reveal raw PII without the additional key access.
  "raw_prompt_ciphertext_hex"     text,
  "raw_prompt_nonce_hex"          text,
  "raw_reasoning_ciphertext_hex"  text,
  "raw_reasoning_nonce_hex"       text,
  "redaction_findings"            jsonb,
  "kms_key_id"                    text NOT NULL,
  "wrapped_dek_b64"               text,
  "created_at"                    timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "agent_span_prompts_customer_created_at_idx"
  ON "agent_span_prompts" ("customer_id", "created_at");

CREATE TABLE "customer_observability_config" (
  "customer_id"                   uuid PRIMARY KEY REFERENCES "customers"("id") ON DELETE CASCADE,
  "prompt_capture_enabled"        boolean   NOT NULL DEFAULT false,
  "prompt_capture_sample_rate"    smallint  NOT NULL DEFAULT 100,
  "prompt_retention_days"         smallint  NOT NULL DEFAULT 30,
  "prompt_kms_key_arn"            text,
  "accepted_tos_version"          text,
  "updated_at"                    timestamp with time zone NOT NULL DEFAULT now()
);
