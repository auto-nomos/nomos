import { describe, expect, it } from 'vitest';
import { AuthorizeDecision, AuthorizeRequest, ReceiptInput } from '../authorize.js';

describe('AuthorizeRequest', () => {
  const validReq = {
    ucan: 'eyJhbGciOiJFZERTQSJ9.payload.sig',
    command: '/github/issue/create',
    resource: { owner: 'acme', repo: 'billing' },
    context: { ip: '127.0.0.1', time: 1_700_000_000_000, user: { id: 'u-1' } },
  };

  it('parses a valid request', () => {
    expect(() => AuthorizeRequest.parse(validReq)).not.toThrow();
  });

  it('roundtrips through JSON', () => {
    expect(AuthorizeRequest.parse(JSON.parse(JSON.stringify(validReq)))).toEqual(validReq);
  });

  it('accepts arbitrary context keys via catchall', () => {
    expect(() =>
      AuthorizeRequest.parse({ ...validReq, context: { region: 'us-east-1', count: 7 } }),
    ).not.toThrow();
  });

  it('rejects empty ucan', () => {
    expect(() => AuthorizeRequest.parse({ ...validReq, ucan: '' })).toThrow();
  });

  it('rejects bad command', () => {
    expect(() => AuthorizeRequest.parse({ ...validReq, command: 'no-slash' })).toThrow();
  });
});

describe('AuthorizeDecision', () => {
  it('parses an allow decision', () => {
    expect(() => AuthorizeDecision.parse({ allow: true, receiptId: 'r-1' })).not.toThrow();
  });

  it('parses a deny with reason', () => {
    expect(() =>
      AuthorizeDecision.parse({ allow: false, reason: 'expired', receiptId: 'r-1' }),
    ).not.toThrow();
  });

  it('parses a step-up decision', () => {
    expect(() =>
      AuthorizeDecision.parse({
        allow: false,
        receiptId: 'r-1',
        requiresStepUp: true,
        stepUpUrl: 'https://app.cb.dev/approve/abc',
      }),
    ).not.toThrow();
  });

  it('rejects unknown reason', () => {
    expect(() =>
      AuthorizeDecision.parse({ allow: false, reason: 'banana', receiptId: 'r-1' }),
    ).toThrow();
  });

  it('rejects bad stepUpUrl', () => {
    expect(() =>
      AuthorizeDecision.parse({
        allow: false,
        receiptId: 'r-1',
        stepUpUrl: 'not-a-url',
      }),
    ).toThrow();
  });
});

describe('ReceiptInput', () => {
  it('parses success', () => {
    expect(() => ReceiptInput.parse({ receiptId: 'r-1', outcome: 'success' })).not.toThrow();
  });

  it('parses failure with metadata', () => {
    expect(() =>
      ReceiptInput.parse({
        receiptId: 'r-1',
        outcome: 'failure',
        metadata: { error: 'rate_limited', retry_after: 30 },
      }),
    ).not.toThrow();
  });

  it('rejects unknown outcome', () => {
    expect(() => ReceiptInput.parse({ receiptId: 'r-1', outcome: 'maybe' })).toThrow();
  });
});
