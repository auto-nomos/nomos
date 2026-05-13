import { z } from 'zod';
import { Did } from './did.js';
import { Command } from './ucan.js';

export const AuditDecision = z.enum(['allow', 'deny', 'stepup']);

export const AuditEvent = z.object({
  event_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  prev_hash: z.string().regex(/^[0-9a-f]{64}$/, 'sha256 hex required'),
  ts: z.number().int().nonnegative(),
  agent: Did,
  decision: AuditDecision,
  command: Command,
  resource: z.record(z.string(), z.unknown()),
  context: z.record(z.string(), z.unknown()),
  hash: z.string().regex(/^[0-9a-f]{64}$/, 'sha256 hex required'),
  /**
   * Sprint MAOS-A — chain causation. Orthogonal to prev_hash (the
   * tamper-evidence chain). Optional for legacy single-UCAN calls.
   */
  parent_receipt_id: z.string().optional(),
  swarm_id: z.string().optional(),
  chain_depth: z.number().int().nonnegative().optional(),
});

export const AuditProof = z.object({
  event_id: z.string().uuid(),
  chain: z.array(z.string().regex(/^[0-9a-f]{64}$/)),
  root_hash: z.string().regex(/^[0-9a-f]{64}$/),
  root_signature: z.string().min(1),
  signing_key_id: z.string().min(1),
});

export type AuditDecision = z.infer<typeof AuditDecision>;
export type AuditEvent = z.infer<typeof AuditEvent>;
export type AuditProof = z.infer<typeof AuditProof>;
