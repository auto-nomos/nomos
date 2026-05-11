import { describe, expect, it } from 'vitest';
import { sanitizeResponseBody } from '../middleware/sanitize-response.js';

describe('sanitizeResponseBody', () => {
  it('passes through plain JSON unchanged', () => {
    const input = { name: 'repo', stars: 42, fork: false };
    const out = sanitizeResponseBody(input);
    expect(out.body).toEqual(input);
    expect(out.redactions).toEqual([]);
  });

  it('redacts GitHub PAT in any string field', () => {
    const out = sanitizeResponseBody({
      message: 'token leaked: ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA was found',
    });
    expect(out.body).toEqual({
      message: 'token leaked: [REDACTED:github_pat] was found',
    });
    expect(out.redactions).toContain('github_pat');
  });

  it('redacts Slack tokens', () => {
    const out = sanitizeResponseBody({
      ok: true,
      bot_token: 'xoxb-1234567890-abcdefghij',
    });
    expect(out.body).toEqual({
      ok: true,
      bot_token: '[REDACTED:slack_token]',
    });
    expect(out.redactions).toContain('slack_token');
  });

  it('redacts JWTs', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const out = sanitizeResponseBody({ access_token: jwt });
    expect((out.body as { access_token: string }).access_token).toBe('[REDACTED:jwt]');
    expect(out.redactions).toContain('jwt');
  });

  it('redacts AWS access keys', () => {
    const out = sanitizeResponseBody({ key: 'AKIAIOSFODNN7EXAMPLE' });
    expect((out.body as { key: string }).key).toBe('[REDACTED:aws_access_key]');
    expect(out.redactions).toContain('aws_access_key');
  });

  it('redacts high-entropy strings under sensitive keys', () => {
    const out = sanitizeResponseBody({
      api_key: 'A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8S9T0',
      label: 'A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8S9T0', // not redacted — innocuous key
    });
    expect((out.body as { api_key: string }).api_key).toBe('[REDACTED:sensitive_key]');
    expect((out.body as { label: string }).label).toBe('A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8S9T0');
  });

  it('does NOT redact commit SHAs (40-hex without sensitive key)', () => {
    const sha = '0123456789abcdef0123456789abcdef01234567';
    const out = sanitizeResponseBody({ sha, message: 'fixup' });
    expect((out.body as { sha: string }).sha).toBe(sha);
  });

  it('strips HTML tags from string fields by default', () => {
    const out = sanitizeResponseBody({
      title: 'hello <script>alert(1)</script> world',
    });
    expect((out.body as { title: string }).title).toBe('hello alert(1) world');
    expect(out.redactions).toContain('html_tag');
  });

  it('does NOT strip HTML when content-type is text/html (caller wants raw)', () => {
    const out = sanitizeResponseBody({ html: '<p>hi</p>' }, 'text/html; charset=utf-8');
    expect((out.body as { html: string }).html).toBe('<p>hi</p>');
  });

  it('strips zero-width Unicode characters', () => {
    const out = sanitizeResponseBody({
      title: 'hi​there‌‍!',
    });
    expect((out.body as { title: string }).title).toBe('hithere!');
    expect(out.redactions).toContain('zero_width');
  });

  it('walks nested objects and arrays', () => {
    const out = sanitizeResponseBody({
      items: [
        { name: 'a', secret: 'A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8S9T0' },
        { name: 'b', token: 'ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
      ],
    });
    const items = (out.body as { items: Array<{ name: string; secret?: string; token?: string }> })
      .items;
    expect(items[0].secret).toBe('[REDACTED:sensitive_key]');
    expect(items[1].token).toBe('[REDACTED:github_pat]');
  });

  it('caps recursion depth (no stack overflow on circular-ish deep nesting)', () => {
    let deep: unknown = { v: 1 };
    for (let i = 0; i < 200; i++) deep = { nested: deep };
    expect(() => sanitizeResponseBody(deep)).not.toThrow();
  });

  it('returns string body unchanged when no patterns match', () => {
    const out = sanitizeResponseBody('plain text response');
    expect(out.body).toBe('plain text response');
    expect(out.redactions).toEqual([]);
  });

  it('redacts secrets inside top-level string body', () => {
    const out = sanitizeResponseBody('error: ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA leaked');
    expect(out.body).toBe('error: [REDACTED:github_pat] leaked');
  });
});
