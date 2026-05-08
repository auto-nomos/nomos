import { describe, expect, it } from 'vitest';
import { Did, DidKey } from '../did.js';

describe('Did', () => {
  it('accepts valid did:key', () => {
    expect(() =>
      Did.parse('did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH'),
    ).not.toThrow();
  });

  it('accepts valid did:web', () => {
    expect(() => Did.parse('did:web:example.com')).not.toThrow();
  });

  it('accepts valid did:plc', () => {
    expect(() => Did.parse('did:plc:abcdef123456')).not.toThrow();
  });

  it('rejects empty string', () => {
    expect(() => Did.parse('')).toThrow();
  });

  it('rejects non-DID strings', () => {
    expect(() => Did.parse('not-a-did')).toThrow();
    expect(() => Did.parse('https://example.com')).toThrow();
    expect(() => Did.parse('did:')).toThrow();
    expect(() => Did.parse('did::abc')).toThrow();
  });

  it('rejects DID with uppercase method', () => {
    expect(() => Did.parse('did:KEY:abc')).toThrow();
  });

  it('rejects non-string input', () => {
    expect(() => Did.parse(123 as unknown)).toThrow();
    expect(() => Did.parse(null as unknown)).toThrow();
  });
});

describe('DidKey', () => {
  it('accepts valid did:key with z prefix and base58btc body', () => {
    expect(() =>
      DidKey.parse('did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH'),
    ).not.toThrow();
  });

  it('rejects did:key without z prefix', () => {
    expect(() => DidKey.parse('did:key:abc')).toThrow();
  });

  it('rejects did:key with non-base58btc characters (contains 0)', () => {
    expect(() => DidKey.parse('did:key:z0abc')).toThrow();
  });

  it('rejects did:web', () => {
    expect(() => DidKey.parse('did:web:example.com')).toThrow();
  });
});
