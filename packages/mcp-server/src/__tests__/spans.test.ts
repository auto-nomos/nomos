import { describe, expect, it } from 'vitest';
import { redactRequest, redactResponse, sha256Of } from '../spans.js';

describe('span redaction', () => {
  describe('redactRequest', () => {
    it('returns only allowlisted keys for the connector', () => {
      const out = redactRequest('/github/repo/create', {
        owner: 'alice',
        repo: 'secrets',
        token: 'ghp_AAAABBBBCCCCDDDDEEEE',
        private: true,
      });
      expect(out).toEqual({ owner: 'alice', repo: 'secrets' });
    });

    it('returns null when no allowlisted keys present', () => {
      const out = redactRequest('/github/repo/create', { irrelevant: 'x' });
      expect(out).toBeNull();
    });

    it('returns null for unknown connectors', () => {
      const out = redactRequest('/unknown-connector/something', { foo: 'bar' });
      expect(out).toBeNull();
    });

    it('drops the entire summary if any value matches a secret regex', () => {
      const out = redactRequest('/github/repo/create', {
        owner: 'Bearer ghp_AAAABBBBCCCCDDDDEEEE',
        repo: 'secrets',
      });
      expect(out).toBeNull();
    });

    it('truncates long string values', () => {
      const long = 'x'.repeat(500);
      const out = redactRequest('/github/repo/create', { owner: long, repo: 'r' });
      expect(typeof out?.owner).toBe('string');
      expect((out?.owner as string).length).toBeLessThanOrEqual(257);
    });
  });

  describe('redactResponse', () => {
    it('keeps only allowlisted response keys', () => {
      const out = redactResponse({
        id: '123',
        url: 'https://api.example.com/x',
        secret_token: 'ghp_AAAABBBBCCCCDDDD',
      });
      expect(out).toEqual({ id: '123', url: 'https://api.example.com/x' });
    });

    it('returns null for null body', () => {
      expect(redactResponse(null)).toBeNull();
    });

    it('returns null when no allowlisted keys', () => {
      expect(redactResponse({ irrelevant: true })).toBeNull();
    });
  });

  describe('sha256Of', () => {
    it('canonicalises object key order', () => {
      const a = sha256Of({ a: 1, b: 2 });
      const b = sha256Of({ b: 2, a: 1 });
      expect(a).toBe(b);
    });

    it('produces a stable hex string', () => {
      const h = sha256Of({ command: '/github/repo/create' });
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    });

    it('hashes null as a distinct value', () => {
      const h = sha256Of(null);
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
