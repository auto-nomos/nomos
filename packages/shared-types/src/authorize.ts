import { z } from 'zod';
import { Command } from './ucan.js';

export const AuthorizeContext = z
  .object({
    ip: z.string().optional(),
    time: z.number().int().nonnegative().optional(),
    user: z.record(z.string(), z.unknown()).optional(),
  })
  .catchall(z.unknown());

export const AuthorizeRequest = z.object({
  ucan: z.string().min(1),
  command: Command,
  resource: z.record(z.string(), z.unknown()),
  context: AuthorizeContext,
  /**
   * Sprint 9 — step-up retry. SDK supplies the cosigner attestation JWT
   * the dashboard minted after a passkey approval. PDP validates the
   * signature + `meta.cosigner_for` matches the request's UCAN cid, then
   * injects `context.cosigner = true` for re-evaluation.
   */
  cosignerJwt: z.string().min(1).optional(),
});

export const DenyReason = z.enum([
  'expired',
  'not_yet_valid',
  'bad_signature',
  'audience_mismatch',
  'command_mismatch',
  'revoked',
  'policy_denied',
  'oauth_token_invalid',
  'unknown_customer',
  'unknown_command',
  'malformed_ucan',
  'untrusted_issuer',
  'step_up_required',
  'cosigner_invalid',
  'cosigner_expired',
  'resource_out_of_scope',
  'schema_violation',
  'agent_not_connected',
  'agent_disabled',
]);

export const AuthorizeDecision = z.object({
  allow: z.boolean(),
  reason: DenyReason.optional(),
  obligations: z.record(z.string(), z.unknown()).optional(),
  receiptId: z.string().min(1),
  requiresStepUp: z.boolean().optional(),
  /**
   * URL the SDK can show the human (deep link to dashboard /approve/:id).
   */
  stepUpUrl: z.string().url().optional(),
  /**
   * Approval id the SDK polls via `GET /v1/stepup/:id` until the user
   * approves or 60s expires, then re-issues authorize with `cosignerJwt`.
   */
  stepUpId: z.string().min(1).optional(),
});

export const ReceiptInput = z.object({
  receiptId: z.string().min(1),
  outcome: z.enum(['success', 'failure']),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type AuthorizeContext = z.infer<typeof AuthorizeContext>;
export type AuthorizeRequest = z.infer<typeof AuthorizeRequest>;
export type DenyReason = z.infer<typeof DenyReason>;
export type AuthorizeDecision = z.infer<typeof AuthorizeDecision>;
export type ReceiptInput = z.infer<typeof ReceiptInput>;
