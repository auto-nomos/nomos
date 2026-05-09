import { describe, expect, it } from 'vitest';
import { parseApiKey } from '../api-key.js';

describe('parseApiKey', () => {
  it('extracts customerId from valid key', () => {
    const customerId = '11111111-1111-1111-1111-111111111111';
    const key = `cb_${customerId}_secrettoken123`;
    expect(parseApiKey(key)).toEqual({ customerId, secret: 'secrettoken123' });
  });

  it('throws on missing prefix', () => {
    expect(() => parseApiKey('not-a-key')).toThrow(/api key/i);
  });

  it('throws on missing secret', () => {
    expect(() => parseApiKey('cb_11111111-1111-1111-1111-111111111111_')).toThrow(/api key/i);
  });

  it('throws on missing customer segment', () => {
    expect(() => parseApiKey('cb__secret')).toThrow(/api key/i);
  });

  it('throws on non-uuid customerId', () => {
    expect(() => parseApiKey('cb_not-a-uuid_secret')).toThrow(/api key/i);
  });

  it('throws on empty input', () => {
    expect(() => parseApiKey('')).toThrow(/api key/i);
  });
});
