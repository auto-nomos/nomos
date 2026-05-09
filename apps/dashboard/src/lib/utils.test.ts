import { describe, expect, it } from 'vitest';
import { cn, formatDate, shortId } from './utils';

describe('cn', () => {
  it('merges tailwind classes', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });
  it('handles falsy values', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
  });
});

describe('shortId', () => {
  it('truncates long ids', () => {
    expect(shortId('00112233-4455-6677-8899-aabbccddeeff')).toBe('00112233…eeff');
  });
  it('returns short ids unchanged', () => {
    expect(shortId('abc')).toBe('abc');
  });
});

describe('formatDate', () => {
  it('formats Date instances', () => {
    expect(formatDate(new Date(0))).toMatch(/19[67]\d/);
  });
  it('parses iso strings', () => {
    const out = formatDate('2026-05-09T12:00:00Z');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(5);
  });
});
