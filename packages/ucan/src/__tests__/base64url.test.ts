import { describe, expect, it } from 'vitest';
import {
  base64urlToBytes,
  base64urlToString,
  bytesToBase64url,
  stringToBase64url,
} from '../base64url.js';

describe('base64url', () => {
  it('roundtrips bytes', () => {
    const input = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const enc = bytesToBase64url(input);
    expect(enc).not.toContain('+');
    expect(enc).not.toContain('/');
    expect(enc).not.toContain('=');
    expect(base64urlToBytes(enc)).toEqual(input);
  });

  it('roundtrips utf-8 strings', () => {
    const input = 'hello, café 🚀';
    expect(base64urlToString(stringToBase64url(input))).toBe(input);
  });

  it('matches Buffer.toString("base64url") for known inputs', () => {
    const bytes = new TextEncoder().encode('subjects?');
    expect(bytesToBase64url(bytes)).toBe('c3ViamVjdHM_');
  });

  it('handles empty input', () => {
    expect(bytesToBase64url(new Uint8Array(0))).toBe('');
    expect(base64urlToBytes('')).toEqual(new Uint8Array(0));
  });
});
