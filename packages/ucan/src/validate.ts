import { canonicalizeDid, publicKeyFromDid, verifyDetached } from '@auto-nomos/crypto';
import type { UcanPayload } from '@auto-nomos/shared-types';
import { parseUcanJwt } from './parse.js';

export type ValidationError =
  | 'malformed_ucan'
  | 'bad_signature'
  | 'expired'
  | 'not_yet_valid'
  | 'audience_mismatch'
  | 'command_mismatch'
  | 'issuer_unsupported';

export interface ValidateOptions {
  audience?: string;
  expectedCommand?: string;
  now?: number;
}

export type ValidateResult =
  | { valid: true; payload: UcanPayload }
  | { valid: false; error: ValidationError };

const encoder = new TextEncoder();

export function actionMatchesGranted(granted: string, action: string): boolean {
  return action === granted || action.startsWith(`${granted}/`);
}

export function validateUcan(jwt: string, opts: ValidateOptions = {}): ValidateResult {
  const parsed = parseUcanJwt(jwt);
  if ('error' in parsed) return { valid: false, error: parsed.error };

  const { header, payload, signature, headerEnc, payloadEnc } = parsed;

  if (header.alg !== 'EdDSA' || header.typ !== 'JWT') {
    return { valid: false, error: 'malformed_ucan' };
  }

  let publicKey: Uint8Array;
  try {
    publicKey = publicKeyFromDid(payload.iss);
  } catch {
    return { valid: false, error: 'issuer_unsupported' };
  }

  const signingInput = encoder.encode(`${headerEnc}.${payloadEnc}`);
  if (!verifyDetached(publicKey, signingInput, signature)) {
    return { valid: false, error: 'bad_signature' };
  }

  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (payload.nbf > now) return { valid: false, error: 'not_yet_valid' };
  if (payload.exp <= now) return { valid: false, error: 'expired' };

  if (opts.audience !== undefined) {
    // Compare on canonical multibase form so caller-supplied DIDs in alternate
    // encodings still match (audit H11, 2026-05-24). Throws on invalid input;
    // wrap so we surface as `audience_mismatch` rather than crashing.
    let canonicalPayloadAud: string;
    let canonicalExpectedAud: string;
    try {
      canonicalPayloadAud = canonicalizeDid(payload.aud);
      canonicalExpectedAud = canonicalizeDid(opts.audience);
    } catch {
      return { valid: false, error: 'audience_mismatch' };
    }
    if (canonicalPayloadAud !== canonicalExpectedAud) {
      return { valid: false, error: 'audience_mismatch' };
    }
  }

  if (
    opts.expectedCommand !== undefined &&
    !actionMatchesGranted(payload.cmd, opts.expectedCommand)
  ) {
    return { valid: false, error: 'command_mismatch' };
  }

  return { valid: true, payload };
}
