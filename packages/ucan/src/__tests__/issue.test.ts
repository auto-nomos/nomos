import { generateKeypair } from '@auto-nomos/crypto';
import type { UcanPayload } from '@auto-nomos/shared-types';
import { describe, expect, it } from 'vitest';
import { issueUcan, UCAN_HEADER } from '../issue.js';
import { parseUcanJwt } from '../parse.js';

function makePayload(overrides: Partial<UcanPayload> = {}): UcanPayload {
  return {
    iss: 'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH',
    aud: 'did:key:z6MkfYn5xx5tPDnPC4xV5cHk3jE4VYGqMgaH7gWPfPaewBy7',
    cmd: '/github/issue/create',
    pol: [['==', '.repo', 'acme/billing']],
    nonce: 'nonce-1',
    nbf: 1_700_000_000,
    exp: 1_700_003_600,
    ...overrides,
  };
}

describe('issueUcan', () => {
  it('produces a valid 3-part JWT and a sha256 cid', () => {
    const kp = generateKeypair();
    const payload = makePayload({ iss: kp.did });
    const issued = issueUcan({ payload, privateKey: kp.privateKey });
    expect(issued.jwt.split('.')).toHaveLength(3);
    expect(issued.cid).toMatch(/^[0-9a-f]{64}$/);
  });

  it('header has alg=EdDSA, typ=JWT, ucv=1.0.0-cb', () => {
    expect(UCAN_HEADER).toEqual({ alg: 'EdDSA', typ: 'JWT', ucv: '1.0.0-cb' });
    const kp = generateKeypair();
    const issued = issueUcan({
      payload: makePayload({ iss: kp.did }),
      privateKey: kp.privateKey,
    });
    const parsed = parseUcanJwt(issued.jwt);
    if ('error' in parsed) throw new Error(parsed.error);
    expect(parsed.header).toEqual(UCAN_HEADER);
  });

  it('returned payload roundtrips through parse', () => {
    const kp = generateKeypair();
    const issued = issueUcan({
      payload: makePayload({ iss: kp.did }),
      privateKey: kp.privateKey,
    });
    const parsed = parseUcanJwt(issued.jwt);
    if ('error' in parsed) throw new Error(parsed.error);
    expect(parsed.payload).toEqual(issued.payload);
  });

  it('rejects malformed payload at issue time', () => {
    const kp = generateKeypair();
    expect(() =>
      issueUcan({
        payload: makePayload({ cmd: 'no-leading-slash' }) as UcanPayload,
        privateKey: kp.privateKey,
      }),
    ).toThrow();
  });

  it('signature is deterministic for same payload + key', () => {
    const kp = generateKeypair();
    const payload = makePayload({ iss: kp.did });
    const a = issueUcan({ payload, privateKey: kp.privateKey });
    const b = issueUcan({ payload, privateKey: kp.privateKey });
    expect(a.jwt).toBe(b.jwt);
    expect(a.cid).toBe(b.cid);
  });
});
