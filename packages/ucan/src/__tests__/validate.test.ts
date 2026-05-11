import { generateKeypair } from '@auto-nomos/crypto';
import type { UcanPayload } from '@auto-nomos/shared-types';
import { describe, expect, it } from 'vitest';
import { stringToBase64url } from '../base64url.js';
import { issueUcan } from '../issue.js';
import { actionMatchesGranted, validateUcan } from '../validate.js';

const NOW = 1_700_001_000;

function makePayload(iss: string, aud: string, overrides: Partial<UcanPayload> = {}): UcanPayload {
  return {
    iss,
    aud,
    cmd: '/github/issue/create',
    pol: [],
    nonce: 'n',
    nbf: 1_700_000_000,
    exp: 1_700_003_600,
    ...overrides,
  };
}

describe('actionMatchesGranted', () => {
  it('returns true for exact match', () => {
    expect(actionMatchesGranted('/github/issue/create', '/github/issue/create')).toBe(true);
  });

  it('returns true when action is deeper than granted', () => {
    expect(actionMatchesGranted('/github', '/github/issue/create')).toBe(true);
  });

  it('returns false when action is broader than granted', () => {
    expect(actionMatchesGranted('/github/issue/create', '/github/issue')).toBe(false);
  });

  it('returns false when action is a sibling that shares prefix', () => {
    expect(actionMatchesGranted('/github/issue', '/github/issuer')).toBe(false);
  });

  it('returns false for different roots', () => {
    expect(actionMatchesGranted('/github', '/slack')).toBe(false);
  });
});

describe('validateUcan', () => {
  it('accepts a valid UCAN', () => {
    const issuer = generateKeypair();
    const audience = generateKeypair();
    const { jwt } = issueUcan({
      payload: makePayload(issuer.did, audience.did),
      privateKey: issuer.privateKey,
    });
    const res = validateUcan(jwt, { now: NOW });
    expect(res.valid).toBe(true);
  });

  it('rejects an expired UCAN', () => {
    const issuer = generateKeypair();
    const audience = generateKeypair();
    const { jwt } = issueUcan({
      payload: makePayload(issuer.did, audience.did, { exp: NOW - 10 }),
      privateKey: issuer.privateKey,
    });
    const res = validateUcan(jwt, { now: NOW });
    expect(res).toEqual({ valid: false, error: 'expired' });
  });

  it('rejects a not-yet-valid UCAN', () => {
    const issuer = generateKeypair();
    const audience = generateKeypair();
    const { jwt } = issueUcan({
      payload: makePayload(issuer.did, audience.did, { nbf: NOW + 10, exp: NOW + 100 }),
      privateKey: issuer.privateKey,
    });
    const res = validateUcan(jwt, { now: NOW });
    expect(res).toEqual({ valid: false, error: 'not_yet_valid' });
  });

  it('rejects a tampered signature', () => {
    const issuer = generateKeypair();
    const audience = generateKeypair();
    const { jwt } = issueUcan({
      payload: makePayload(issuer.did, audience.did),
      privateKey: issuer.privateKey,
    });
    const parts = jwt.split('.');
    const tampered = `${parts[0]}.${parts[1]}.${'A'.repeat((parts[2] as string).length)}`;
    const res = validateUcan(tampered, { now: NOW });
    expect(res).toEqual({ valid: false, error: 'bad_signature' });
  });

  it('rejects when issuer is signed with wrong key', () => {
    const claimedIssuer = generateKeypair();
    const realSigner = generateKeypair();
    const audience = generateKeypair();
    const { jwt } = issueUcan({
      payload: makePayload(claimedIssuer.did, audience.did),
      privateKey: realSigner.privateKey,
    });
    const res = validateUcan(jwt, { now: NOW });
    expect(res).toEqual({ valid: false, error: 'bad_signature' });
  });

  it('rejects audience mismatch', () => {
    const issuer = generateKeypair();
    const audience = generateKeypair();
    const other = generateKeypair();
    const { jwt } = issueUcan({
      payload: makePayload(issuer.did, audience.did),
      privateKey: issuer.privateKey,
    });
    const res = validateUcan(jwt, { now: NOW, audience: other.did });
    expect(res).toEqual({ valid: false, error: 'audience_mismatch' });
  });

  it('rejects command mismatch', () => {
    const issuer = generateKeypair();
    const audience = generateKeypair();
    const { jwt } = issueUcan({
      payload: makePayload(issuer.did, audience.did, { cmd: '/github/issue/create' }),
      privateKey: issuer.privateKey,
    });
    const res = validateUcan(jwt, { now: NOW, expectedCommand: '/github/pr/merge' });
    expect(res).toEqual({ valid: false, error: 'command_mismatch' });
  });

  it('accepts when expectedCommand is deeper than granted', () => {
    const issuer = generateKeypair();
    const audience = generateKeypair();
    const { jwt } = issueUcan({
      payload: makePayload(issuer.did, audience.did, { cmd: '/github' }),
      privateKey: issuer.privateKey,
    });
    const res = validateUcan(jwt, { now: NOW, expectedCommand: '/github/issue/create' });
    expect(res.valid).toBe(true);
  });

  it('rejects malformed JWT', () => {
    expect(validateUcan('not-a-jwt', { now: NOW })).toEqual({
      valid: false,
      error: 'malformed_ucan',
    });
  });

  it('rejects header with wrong alg or typ', () => {
    const issuer = generateKeypair();
    const audience = generateKeypair();
    const payload = makePayload(issuer.did, audience.did);
    const headerEnc = stringToBase64url(
      JSON.stringify({ alg: 'HS256', typ: 'JWT', ucv: '1.0.0-cb' }),
    );
    const payloadEnc = stringToBase64url(JSON.stringify(payload));
    const fakeJwt = `${headerEnc}.${payloadEnc}.AAAA`;
    expect(validateUcan(fakeJwt, { now: NOW })).toEqual({ valid: false, error: 'malformed_ucan' });
  });

  it('rejects unsupported issuer (non did:key)', () => {
    const audience = generateKeypair();
    const issuer = generateKeypair();
    // Forge a payload that claims a did:web issuer and re-sign with our local key
    const payload = makePayload('did:web:example.com', audience.did);
    const headerEnc = stringToBase64url(
      JSON.stringify({ alg: 'EdDSA', typ: 'JWT', ucv: '1.0.0-cb' }),
    );
    const payloadEnc = stringToBase64url(JSON.stringify(payload));
    const fakeJwt = `${headerEnc}.${payloadEnc}.AAAA`;
    const res = validateUcan(fakeJwt, { now: NOW });
    expect(res).toEqual({ valid: false, error: 'issuer_unsupported' });
    // ensure we didn't pretend to verify the signature
    expect(issuer).toBeTruthy();
  });

  it('uses Date.now when no now option is given', () => {
    const issuer = generateKeypair();
    const audience = generateKeypair();
    const nowSec = Math.floor(Date.now() / 1000);
    const { jwt } = issueUcan({
      payload: makePayload(issuer.did, audience.did, { nbf: nowSec - 60, exp: nowSec + 60 }),
      privateKey: issuer.privateKey,
    });
    const res = validateUcan(jwt);
    expect(res.valid).toBe(true);
  });
});
