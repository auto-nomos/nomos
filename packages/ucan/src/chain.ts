import type { UcanPayload } from '@credential-broker/shared-types';
import { actionMatchesGranted, type ValidationError, validateUcan } from './validate.js';

export type ChainError = ValidationError | 'broken_delegation' | 'over_attenuated' | 'empty_chain';

export type ChainResult =
  | { valid: true; root: UcanPayload; leaf: UcanPayload }
  | { valid: false; error: ChainError };

export interface ValidateChainOptions {
  /**
   * UCANs ordered root-first (`jwts[0]` is the original delegation,
   * `jwts[N-1]` is the leaf delegation that the agent presents).
   */
  audience?: string;
  expectedCommand?: string;
  now?: number;
}

export function validateChain(jwts: string[], opts: ValidateChainOptions = {}): ChainResult {
  if (jwts.length === 0) return { valid: false, error: 'empty_chain' };

  const payloads: UcanPayload[] = [];
  for (let i = 0; i < jwts.length; i++) {
    const jwt = jwts[i] as string;
    const isLeaf = i === jwts.length - 1;
    const res = validateUcan(jwt, {
      now: opts.now,
      audience: isLeaf ? opts.audience : undefined,
      expectedCommand: isLeaf ? opts.expectedCommand : undefined,
    });
    if (!res.valid) return { valid: false, error: res.error };
    payloads.push(res.payload);
  }

  for (let i = 0; i < payloads.length - 1; i++) {
    const parent = payloads[i] as UcanPayload;
    const child = payloads[i + 1] as UcanPayload;

    if (child.iss !== parent.aud) {
      return { valid: false, error: 'broken_delegation' };
    }
    if (!actionMatchesGranted(parent.cmd, child.cmd)) {
      return { valid: false, error: 'over_attenuated' };
    }
    if (child.exp > parent.exp) {
      return { valid: false, error: 'over_attenuated' };
    }
    if (child.nbf < parent.nbf) {
      return { valid: false, error: 'over_attenuated' };
    }
  }

  return {
    valid: true,
    root: payloads[0] as UcanPayload,
    leaf: payloads[payloads.length - 1] as UcanPayload,
  };
}
