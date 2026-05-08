import { describe, expect, it } from 'vitest';
import {
  Policy,
  PolicyBundle,
  RevocationEntry,
  RevocationList,
  SignedPolicyBundle,
} from '../policy.js';

const cust = '550e8400-e29b-41d4-a716-446655440000';
const polId = '550e8400-e29b-41d4-a716-446655440001';

const validPolicy = {
  id: polId,
  customer_id: cust,
  integration: 'github',
  cedar_text: 'permit(principal, action, resource);',
  version: 1,
  enabled: true,
  created_at: 1_700_000_000_000,
  updated_at: 1_700_000_000_000,
};

describe('Policy', () => {
  it('parses a valid policy', () => {
    expect(() => Policy.parse(validPolicy)).not.toThrow();
  });

  it('roundtrips through JSON', () => {
    const json = JSON.stringify(validPolicy);
    expect(Policy.parse(JSON.parse(json))).toEqual(validPolicy);
  });

  it('rejects bad uuid', () => {
    expect(() => Policy.parse({ ...validPolicy, id: 'not-a-uuid' })).toThrow();
  });

  it('rejects empty cedar_text or integration', () => {
    expect(() => Policy.parse({ ...validPolicy, cedar_text: '' })).toThrow();
    expect(() => Policy.parse({ ...validPolicy, integration: '' })).toThrow();
  });

  it('rejects non-positive version', () => {
    expect(() => Policy.parse({ ...validPolicy, version: 0 })).toThrow();
  });
});

describe('PolicyBundle', () => {
  const validBundle = {
    customer_id: cust,
    version: 1,
    generated_at: 1_700_000_000_000,
    policies: [validPolicy],
    schema_hashes: { github: 'a'.repeat(64) },
  };

  it('parses a valid bundle', () => {
    expect(() => PolicyBundle.parse(validBundle)).not.toThrow();
  });

  it('accepts empty policies array', () => {
    expect(() => PolicyBundle.parse({ ...validBundle, policies: [] })).not.toThrow();
  });

  it('rejects when policies contains invalid entry', () => {
    expect(() =>
      PolicyBundle.parse({ ...validBundle, policies: [{ ...validPolicy, version: -1 }] }),
    ).toThrow();
  });
});

describe('SignedPolicyBundle', () => {
  it('parses a valid signed bundle', () => {
    expect(() =>
      SignedPolicyBundle.parse({
        bundle: {
          customer_id: cust,
          version: 1,
          generated_at: 1,
          policies: [],
          schema_hashes: {},
        },
        signature: 'sig-base64',
        signing_key_id: 'kid-1',
      }),
    ).not.toThrow();
  });

  it('rejects empty signature', () => {
    expect(() =>
      SignedPolicyBundle.parse({
        bundle: { customer_id: cust, version: 1, generated_at: 1, policies: [], schema_hashes: {} },
        signature: '',
        signing_key_id: 'kid-1',
      }),
    ).toThrow();
  });
});

describe('RevocationEntry / RevocationList', () => {
  it('parses a revocation entry', () => {
    expect(() =>
      RevocationEntry.parse({
        cid: 'bafy1',
        customer_id: cust,
        revoked_at: 1_700_000_000_000,
        reason: 'manual',
      }),
    ).not.toThrow();
  });

  it('parses revocation list', () => {
    expect(() =>
      RevocationList.parse({
        customer_id: cust,
        generated_at: 1_700_000_000_000,
        entries: [],
      }),
    ).not.toThrow();
  });

  it('rejects invalid cid (empty)', () => {
    expect(() =>
      RevocationEntry.parse({
        cid: '',
        customer_id: cust,
        revoked_at: 1,
      }),
    ).toThrow();
  });
});
