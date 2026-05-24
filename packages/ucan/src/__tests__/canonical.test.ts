import { describe, expect, it } from 'vitest';
import { canonicalize } from '../canonical.js';

describe('canonicalize', () => {
  it('serializes primitives', () => {
    expect(canonicalize('a')).toBe('"a"');
    expect(canonicalize(42)).toBe('42');
    expect(canonicalize(true)).toBe('true');
    expect(canonicalize(false)).toBe('false');
    expect(canonicalize(null)).toBe('null');
  });

  it('sorts object keys lexicographically', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalize({ z: 1, y: { c: 3, a: 4 }, x: 2 })).toBe('{"x":2,"y":{"a":4,"c":3},"z":1}');
  });

  it('preserves array order', () => {
    expect(canonicalize([3, 1, 2])).toBe('[3,1,2]');
    expect(canonicalize(['b', 'a'])).toBe('["b","a"]');
  });

  it('omits undefined values from objects', () => {
    expect(canonicalize({ a: 1, b: undefined, c: 3 })).toBe('{"a":1,"c":3}');
  });

  it('audit M11 — NFC-normalizes keys before sort (NFD twin = same output)', () => {
    // é (NFC é) vs e + ́ (NFD é). Both should canonicalize to NFC.
    const nfc = canonicalize({ café: 1 });
    const nfd = canonicalize({ ['café']: 1 });
    expect(nfc).toBe(nfd);
    expect(nfc).toBe(`{${JSON.stringify('café')}:1}`);
  });

  it('audit M11 — de-duplicates keys that collide after NFC normalize', () => {
    // If both NFC and NFD forms are present, keep the first (insertion order).
    const out = canonicalize({ café: 1, ['café']: 2 });
    expect(out).toBe(`{${JSON.stringify('café')}:1}`);
  });

  it('throws on top-level undefined', () => {
    expect(() => canonicalize(undefined)).toThrow(/cannot canonicalize undefined/);
  });

  it('throws on non-finite numbers', () => {
    expect(() => canonicalize(Number.POSITIVE_INFINITY)).toThrow(/non-finite/);
    expect(() => canonicalize(Number.NaN)).toThrow(/non-finite/);
  });

  it('escapes special characters in strings', () => {
    expect(canonicalize('a"b\\c')).toBe('"a\\"b\\\\c"');
  });

  it('throws on functions or symbols', () => {
    expect(() => canonicalize(() => 1)).toThrow(/cannot canonicalize/);
    expect(() => canonicalize(Symbol('x'))).toThrow(/cannot canonicalize/);
  });

  it('produces identical output for equivalent inputs in different key order', () => {
    const a = canonicalize({ x: 1, y: 2, z: 3 });
    const b = canonicalize({ z: 3, y: 2, x: 1 });
    expect(a).toBe(b);
  });
});
