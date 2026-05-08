import { z } from 'zod';
import { Did } from './did.js';
import { Command } from './ucan.js';

export const AgentStatus = z.enum(['active', 'revoked', 'suspended']);

export const AgentRecord = z.object({
  id: z.string().uuid(),
  customer_id: z.string().uuid(),
  did: Did,
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  status: AgentStatus,
  created_at: z.number().int().nonnegative(),
  last_active_at: z.number().int().nonnegative().optional(),
});

export const MintUcanInput = z.object({
  agent_id: z.string().uuid(),
  command: Command,
  policy_id: z.string().uuid(),
  ttl_seconds: z.number().int().positive().max(86400),
  resource_subject: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export type AgentStatus = z.infer<typeof AgentStatus>;
export type AgentRecord = z.infer<typeof AgentRecord>;
export type MintUcanInput = z.infer<typeof MintUcanInput>;
