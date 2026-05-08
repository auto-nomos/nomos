import { generateKeypair } from '@credential-broker/crypto';
import type { UcanPayload } from '@credential-broker/shared-types';
import { describe, expect, it } from 'vitest';
import { stringToBase64url } from '../base64url.js';
import { issueUcan } from '../issue.js';
import { parseUcanJwt } from '../parse.js';

function makePayload(iss: string): UcanPayload {
  return {
    iss,
    aud: 'did:key:z6MkfYn5xx5tPDnPC4xV5cHk3jE4VYGqMgaH7gWPfPaewBy7',
    cmd: '/x/y',
    pol: [],
    nonce: 'n',
    nbf: 1_700_000_000,
    exp: 1_700_003_600,
  };
}

describe('parseUcanJwt', () => {
  it('parses a freshly-issued JWT', () => {
    const kp = generateKeypair();
    const { jwt } = issueUcan({ payload: makePayload(kp.did), privateKey: kp.privateKey });
    const parsed = parseUcanJwt(jwt);
    expect('error' in parsed).toBe(false);
  });

  it('rejects JWT with wrong number of parts', () => {
    expect(parseUcanJwt('a.b')).toEqual({ error: 'malformed_ucan' });
    expect(parseUcanJwt('a.b.c.d')).toEqual({ error: 'malformed_ucan' });
    expect(parseUcanJwt('only-one-part')).toEqual({ error: 'malformed_ucan' });
  });

  it('rejects JWT with bad base64url in header', () => {
    expect(parseUcanJwt('!!.eyJ.sig')).toEqual({ error: 'malformed_ucan' });
  });

  it('rejects JWT with non-string header fields', () => {
    const badHeader = stringToBase64url(JSON.stringify({ alg: 1, typ: 'JWT', ucv: '1.0.0-cb' }));
    const payloadEnc = stringToBase64url(JSON.stringify(makePayload('did:key:z1')));
    expect(parseUcanJwt(`${badHeader}.${payloadEnc}.sig`)).toEqual({ error: 'malformed_ucan' });
  });

  it('rejects JWT with non-UcanPayload payload', () => {
    const headerEnc = stringToBase64url(
      JSON.stringify({ alg: 'EdDSA', typ: 'JWT', ucv: '1.0.0-cb' }),
    );
    const payloadEnc = stringToBase64url(JSON.stringify({ not: 'a ucan' }));
    expect(parseUcanJwt(`${headerEnc}.${payloadEnc}.sig`)).toEqual({ error: 'malformed_ucan' });
  });

  it('rejects JWT with payload that is not valid JSON', () => {
    const headerEnc = stringToBase64url(
      JSON.stringify({ alg: 'EdDSA', typ: 'JWT', ucv: '1.0.0-cb' }),
    );
    const payloadEnc = stringToBase64url('not-json');
    expect(parseUcanJwt(`${headerEnc}.${payloadEnc}.sig`)).toEqual({ error: 'malformed_ucan' });
  });
});
