import { z } from 'zod';
import { Command, ResourceConstraint } from './ucan.js';

export const Intent = z.object({
  constraint: ResourceConstraint,
  actions: z.array(Command).min(1),
  ttlSeconds: z.number().int().positive().max(3600),
  /** Free-text declaration of *why* the agent is making this call.
   *  Fed to the optional LLM coherence verifier when enabled.
   *  Required when coherence verification is on; ignored otherwise. */
  purpose: z.string().min(8).max(280).optional(),
  /** Optional structured args (recipient, body keys, query params) the
   *  LLM verifier reads for chain-context. */
  requestArgs: z.record(z.string(), z.unknown()).optional(),
});

export const IntentRequest = z.object({
  agentId: z.string().uuid(),
  intent: Intent,
  parentEnvelopeId: z.string().uuid().optional(),
  cosignerJwt: z.string().min(1).optional(),
});

export const IntentMintResponse = z.object({
  kind: z.literal('mint'),
  ucan: z.string().min(1),
  envelopeId: z.string().uuid(),
  expiresAt: z.number().int().positive(),
});

export const IntentStepUpResponse = z.object({
  kind: z.literal('stepup'),
  stepUpId: z.string().min(1),
  stepUpUrl: z.string().url(),
  proposedEnvelope: z.object({
    constraint: ResourceConstraint,
    actions: z.array(Command),
    ttlSeconds: z.number().int().positive(),
  }),
});

export const IntentResponse = z.discriminatedUnion('kind', [
  IntentMintResponse,
  IntentStepUpResponse,
]);

export type Intent = z.infer<typeof Intent>;
export type IntentRequest = z.infer<typeof IntentRequest>;
export type IntentMintResponse = z.infer<typeof IntentMintResponse>;
export type IntentStepUpResponse = z.infer<typeof IntentStepUpResponse>;
export type IntentResponse = z.infer<typeof IntentResponse>;
