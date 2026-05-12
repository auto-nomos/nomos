import { type UcanPayload, UcanPayload as UcanPayloadSchema } from '@auto-nomos/shared-types';
import { base64urlToBytes, base64urlToString } from './base64url.js';

export interface ParsedUcan {
  header: { alg: string; typ: string; ucv: string };
  payload: UcanPayload;
  signature: Uint8Array;
  headerEnc: string;
  payloadEnc: string;
}

export function parseUcanJwt(jwt: string): ParsedUcan | { error: 'malformed_ucan' } {
  const parts = jwt.split('.');
  if (parts.length !== 3) return { error: 'malformed_ucan' };
  const [headerEnc, payloadEnc, sigEnc] = parts as [string, string, string];
  let header: ParsedUcan['header'];
  let payload: UcanPayload;
  let signature: Uint8Array;
  try {
    const headerJson = base64urlToString(headerEnc);
    const headerObj = JSON.parse(headerJson) as Record<string, unknown>;
    if (
      typeof headerObj.alg !== 'string' ||
      typeof headerObj.typ !== 'string' ||
      typeof headerObj.ucv !== 'string'
    ) {
      return { error: 'malformed_ucan' };
    }
    header = {
      alg: headerObj.alg,
      typ: headerObj.typ,
      ucv: headerObj.ucv,
    };
    const payloadJson = base64urlToString(payloadEnc);
    const payloadParsed = UcanPayloadSchema.safeParse(JSON.parse(payloadJson));
    if (!payloadParsed.success) return { error: 'malformed_ucan' };
    payload = payloadParsed.data;
    signature = base64urlToBytes(sigEnc);
  } catch {
    return { error: 'malformed_ucan' };
  }
  return { header, payload, signature, headerEnc, payloadEnc };
}

/** Read `meta.agent_id` from a UCAN JWT. Returns undefined on parse failure
 *  or when the field is absent. Best-effort — does not verify the signature.
 *  Callers that need authenticated identity must run full chain validation
 *  first. */
export function extractAgentId(jwt: string): string | undefined {
  const parsed = parseUcanJwt(jwt);
  if ('error' in parsed) return undefined;
  const meta = parsed.payload.meta as Record<string, unknown> | undefined;
  return typeof meta?.agent_id === 'string' ? meta.agent_id : undefined;
}

/** Read the `aud` (audience / agent DID) from a UCAN JWT. Returns the
 *  literal `"unknown"` on parse failure so callers can thread the value
 *  into audit rows without conditional handling. */
export function extractAgentDid(jwt: string): string {
  const parsed = parseUcanJwt(jwt);
  if ('error' in parsed) return 'unknown';
  return parsed.payload.aud;
}
