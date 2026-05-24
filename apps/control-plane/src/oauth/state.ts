/**
 * Signed OAuth `state` parameter.
 *
 * The provider redirects the user back to /v1/oauth/callback/:connector with
 * `?code=<authcode>&state=<state>`. Without a signed state the callback is
 * an open redirect / CSRF surface — anyone could send a victim through it.
 *
 * We sign a small JSON payload with HMAC-SHA256 keyed by
 * OAUTH_STATE_SIGN_SECRET, then base64url-encode `payload.signature`. The
 * payload carries the originating customer + connector + nonce + expiry so
 * the callback can verify it matches the request and is fresh.
 */

import { timingSafeEqual } from 'node:crypto';
import { base64urlToString, bytesToBase64url, stringToBase64url } from '@auto-nomos/ucan';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';

const encoder = new TextEncoder();

export interface OAuthStatePayload {
  customerId: string;
  connector: string;
  nonce: string;
  exp: number;
}

export function signState(secret: string, payload: OAuthStatePayload): string {
  const json = JSON.stringify(payload);
  const sig = hmac(sha256, encoder.encode(secret), encoder.encode(json));
  return `${stringToBase64url(json)}.${bytesToBase64url(sig)}`;
}

export interface VerifyResult {
  ok: boolean;
  reason?: string;
  payload?: OAuthStatePayload;
}

export function verifyState(secret: string, state: string, now: number = Date.now()): VerifyResult {
  if (typeof state !== 'string' || state.length === 0) {
    return { ok: false, reason: 'state missing' };
  }
  const parts = state.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'state malformed' };
  let payloadJson: string;
  try {
    payloadJson = base64urlToString(parts[0] ?? '');
  } catch {
    return { ok: false, reason: 'state payload not base64url' };
  }
  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(payloadJson) as OAuthStatePayload;
  } catch {
    return { ok: false, reason: 'state payload not JSON' };
  }
  if (
    typeof payload.customerId !== 'string' ||
    typeof payload.connector !== 'string' ||
    typeof payload.nonce !== 'string' ||
    typeof payload.exp !== 'number'
  ) {
    return { ok: false, reason: 'state payload shape invalid' };
  }
  // Constant-time comparison on raw HMAC bytes. The previous string-compare
  // on base64url-encoded signatures leaked per-character timing → recoverable
  // forge of any (customer, connector) state.
  const expected = hmac(sha256, encoder.encode(secret), encoder.encode(payloadJson));
  const presentedB64 = parts[1] ?? '';
  let presented: Uint8Array;
  try {
    presented = base64urlToBytesStrict(presentedB64);
  } catch {
    return { ok: false, reason: 'state signature mismatch' };
  }
  if (presented.length !== expected.length) {
    return { ok: false, reason: 'state signature mismatch' };
  }
  if (!timingSafeEqual(presented, expected)) {
    return { ok: false, reason: 'state signature mismatch' };
  }
  if (payload.exp < now) {
    return { ok: false, reason: 'state expired' };
  }
  return { ok: true, payload };
}

export function freshNonce(): string {
  return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function base64urlToBytesStrict(s: string): Uint8Array {
  const pad = s.length % 4 === 2 ? '==' : s.length % 4 === 3 ? '=' : '';
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = Buffer.from(b64, 'base64');
  return new Uint8Array(bin);
}
