import { describe, expect, it } from 'vitest';
import { computeCid } from '../cid.js';

describe('computeCid', () => {
  it('returns sha256 hex', () => {
    expect(computeCid('hello')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', () => {
    expect(computeCid('abc')).toBe(computeCid('abc'));
  });

  it('differs for different input', () => {
    expect(computeCid('a')).not.toBe(computeCid('b'));
  });
});
