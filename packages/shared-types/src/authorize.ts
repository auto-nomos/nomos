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
  'malformed_ucan',
]);

export const AuthorizeDecision = z.object({
  allow: z.boolean(),
  reason: DenyReason.optional(),
  obligations: z.record(z.string(), z.unknown()).optional(),
  receiptId: z.string().min(1),
  requiresStepUp: z.boolean().optional(),
  stepUpUrl: z.string().url().optional(),
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
