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

import { base64urlToString, bytesToBase64url, stringToBase64url } from '@credential-broker/ucan';
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
  // Constant-time-ish comparison: recompute the signature, compare bytes.
  const expected = hmac(sha256, encoder.encode(secret), encoder.encode(payloadJson));
  if (bytesToBase64url(expected) !== parts[1]) {
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
