import { canonicalizeDid, signDetached } from '@auto-nomos/crypto';
import { type UcanPayload, UcanPayload as UcanPayloadSchema } from '@auto-nomos/shared-types';
import { bytesToBase64url, stringToBase64url } from './base64url.js';
import { canonicalize } from './canonical.js';
import { computeCid } from './cid.js';

export const UCAN_HEADER = {
  alg: 'EdDSA' as const,
  typ: 'JWT' as const,
  ucv: '1.0.0-cb' as const,
};

export interface IssueInput {
  payload: UcanPayload;
  privateKey: Uint8Array;
}

export interface UcanIssued {
  cid: string;
  jwt: string;
  payload: UcanPayload;
}

const encoder = new TextEncoder();

export function issueUcan({ payload, privateKey }: IssueInput): UcanIssued {
  // Canonicalize iss / aud to a single multibase form before signing so two
  // alternate encodings of the same key cannot produce two distinct CIDs
  // for the same authority (audit H11, 2026-05-24).
  const normalized: UcanPayload = {
    ...payload,
    iss: canonicalizeDid(payload.iss),
    aud: canonicalizeDid(payload.aud),
  };
  const validated = UcanPayloadSchema.parse(normalized);
  const headerEnc = stringToBase64url(canonicalize(UCAN_HEADER));
  const payloadEnc = stringToBase64url(canonicalize(validated));
  const signingInput = `${headerEnc}.${payloadEnc}`;
  const signature = signDetached(privateKey, encoder.encode(signingInput));
  const sigEnc = bytesToBase64url(signature);
  const jwt = `${signingInput}.${sigEnc}`;
  return { cid: computeCid(jwt), jwt, payload: validated };
}
