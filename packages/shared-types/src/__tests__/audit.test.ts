import { describe, expect, it } from 'vitest';
import { AuditEvent, AuditProof } from '../audit.js';

const cust = '550e8400-e29b-41d4-a716-446655440000';
const eventId = '550e8400-e29b-41d4-a716-446655440002';
const sha = (n: number) => n.toString(16).padStart(64, '0');

const baseEvent = {
  event_id: eventId,
  customer_id: cust,
  prev_hash: sha(0),
  ts: 1_700_000_000_000,
  agent: 'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH',
  decision: 'allow' as const,
  command: '/github/issue/create',
  resource: { owner: 'acme', repo: 'billing' },
  context: { ip: '1.2.3.4' },
  hash: sha(1),
};

describe('AuditEvent', () => {
  it('parses a valid event', () => {
    expect(() => AuditEvent.parse(baseEvent)).not.toThrow();
  });

  it('roundtrips through JSON', () => {
    expect(AuditEvent.parse(JSON.parse(JSON.stringify(baseEvent)))).toEqual(baseEvent);
  });

  it('rejects non-hex prev_hash or hash', () => {
    expect(() => AuditEvent.parse({ ...baseEvent, prev_hash: 'not-hex' })).toThrow();
    expect(() => AuditEvent.parse({ ...baseEvent, hash: 'g'.repeat(64) })).toThrow();
  });

  it('rejects too-short hash', () => {
    expect(() => AuditEvent.parse({ ...baseEvent, hash: '00' })).toThrow();
  });

  it('rejects unknown decision', () => {
    expect(() =>
      AuditEvent.parse({ ...baseEvent, decision: 'maybe' as unknown as 'allow' }),
    ).toThrow();
  });

  it('rejects bad command', () => {
    expect(() => AuditEvent.parse({ ...baseEvent, command: 'no-slash' })).toThrow();
  });
});

describe('AuditProof', () => {
  it('parses a valid proof', () => {
    expect(() =>
      AuditProof.parse({
        event_id: eventId,
        chain: [sha(1), sha(2), sha(3)],
        root_hash: sha(99),
        root_signature: 'sig-base64',
        signing_key_id: 'kms-1',
      }),
    ).not.toThrow();
  });

  it('rejects empty signature', () => {
    expect(() =>
      AuditProof.parse({
        event_id: eventId,
        chain: [],
        root_hash: sha(99),
        root_signature: '',
        signing_key_id: 'kms-1',
      }),
    ).toThrow();
  });
});
