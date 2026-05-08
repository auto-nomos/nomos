import { describe, expect, it } from 'vitest';
import { Command, PolicyPredicate, UcanIssue, UcanPayload } from '../ucan.js';

const validIss = 'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH';
const validAud = 'did:key:z6MkfYn5xx5tPDnPC4xV5cHk3jE4VYGqMgaH7gWPfPaewBy7';

const baseUcan = {
  iss: validIss,
  aud: validAud,
  cmd: '/github/issue/create',
  pol: [['==', '.repo', 'acme/billing']] as [string, string, unknown][],
  nonce: 'abc123',
  nbf: 1_700_000_000,
  exp: 1_700_003_600,
};

describe('Command', () => {
  it('accepts hierarchical commands', () => {
    expect(() => Command.parse('/github/issue/create')).not.toThrow();
    expect(() => Command.parse('/stripe/charge')).not.toThrow();
    expect(() => Command.parse('/foo')).not.toThrow();
    expect(() => Command.parse('/under_score/ok-too')).not.toThrow();
  });

  it('rejects commands without leading slash', () => {
    expect(() => Command.parse('github/issue')).toThrow();
  });

  it('rejects uppercase commands', () => {
    expect(() => Command.parse('/GitHub/Issue')).toThrow();
  });

  it('rejects trailing slash', () => {
    expect(() => Command.parse('/github/issue/')).toThrow();
  });

  it('rejects empty path segment', () => {
    expect(() => Command.parse('/github//issue')).toThrow();
  });

  it('rejects empty string', () => {
    expect(() => Command.parse('')).toThrow();
  });
});

describe('PolicyPredicate', () => {
  it('accepts a triple of [op, path, value]', () => {
    expect(() => PolicyPredicate.parse(['==', '.repo', 'acme/billing'])).not.toThrow();
    expect(() => PolicyPredicate.parse(['in', '.year', [2025, 2026]])).not.toThrow();
  });

  it('rejects wrong arity', () => {
    expect(() => PolicyPredicate.parse(['==', '.repo'])).toThrow();
    expect(() => PolicyPredicate.parse(['==', '.repo', 'a', 'b'])).toThrow();
  });

  it('rejects non-string op or path', () => {
    expect(() => PolicyPredicate.parse([1, '.repo', 'x'])).toThrow();
    expect(() => PolicyPredicate.parse(['==', 2, 'x'])).toThrow();
  });
});

describe('UcanPayload', () => {
  it('parses a valid payload', () => {
    const parsed = UcanPayload.parse(baseUcan);
    expect(parsed.cmd).toBe('/github/issue/create');
    expect(parsed.pol).toHaveLength(1);
  });

  it('roundtrips through JSON', () => {
    const json = JSON.stringify(baseUcan);
    const parsed = UcanPayload.parse(JSON.parse(json));
    expect(parsed).toEqual(baseUcan);
  });

  it('accepts optional sub, meta, prf', () => {
    const full = {
      ...baseUcan,
      sub: 'subject-1',
      meta: { audit_hint: 'foo', customer_id: 'cust-1' },
      prf: ['bafy123', 'bafy456'],
    };
    expect(() => UcanPayload.parse(full)).not.toThrow();
  });

  it('rejects exp <= nbf', () => {
    expect(() => UcanPayload.parse({ ...baseUcan, exp: baseUcan.nbf })).toThrow(/exp must be/);
    expect(() => UcanPayload.parse({ ...baseUcan, exp: baseUcan.nbf - 1 })).toThrow(/exp must be/);
  });

  it('rejects negative nbf', () => {
    expect(() => UcanPayload.parse({ ...baseUcan, nbf: -1 })).toThrow();
  });

  it('rejects non-positive exp', () => {
    expect(() => UcanPayload.parse({ ...baseUcan, exp: 0 })).toThrow();
  });

  it('rejects empty nonce', () => {
    expect(() => UcanPayload.parse({ ...baseUcan, nonce: '' })).toThrow();
  });

  it('rejects bad iss / aud', () => {
    expect(() => UcanPayload.parse({ ...baseUcan, iss: 'not-a-did' })).toThrow();
    expect(() => UcanPayload.parse({ ...baseUcan, aud: 'not-a-did' })).toThrow();
  });

  it('rejects bad cmd', () => {
    expect(() => UcanPayload.parse({ ...baseUcan, cmd: 'github/no-slash' })).toThrow();
  });
});

describe('UcanIssue', () => {
  it('parses valid issue record', () => {
    expect(() =>
      UcanIssue.parse({
        cid: 'bafy1',
        jwt: 'eyJ...',
        payload: baseUcan,
      }),
    ).not.toThrow();
  });

  it('rejects empty cid or jwt', () => {
    expect(() => UcanIssue.parse({ cid: '', jwt: 'eyJ', payload: baseUcan })).toThrow();
    expect(() => UcanIssue.parse({ cid: 'b', jwt: '', payload: baseUcan })).toThrow();
  });
});
