import { describe, expect, it } from 'vitest';
import { redact, totalFindings } from '../index.js';

describe('redact', () => {
  it('returns empty findings for empty input', () => {
    const r = redact('');
    expect(r.redacted).toBe('');
    expect(totalFindings(r.findings)).toBe(0);
  });

  it('scrubs emails and counts them', () => {
    const r = redact('contact alice@acme.com or bob@example.org for access');
    expect(r.redacted).toBe('contact [REDACTED:email] or [REDACTED:email] for access');
    expect(r.findings.email).toBe(2);
    expect(totalFindings(r.findings)).toBe(2);
  });

  it('scrubs US SSN with mandatory hyphens', () => {
    const r = redact('SSN 123-45-6789 on file');
    expect(r.redacted).toBe('SSN [REDACTED:ssn] on file');
    expect(r.findings.ssn).toBe(1);
  });

  it('scrubs JWT + github + stripe + slack + aws bearer tokens', () => {
    const cases = [
      'auth: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.abc-_def',
      'github push ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789',
      'stripe sk_live_AbCdEfGhIjKlMnOpQrStUvWxYz0123',
      'slack xoxb-1234567890-abcdefghijklmnop-qrstu',
      'aws AKIAIOSFODNN7EXAMPLE',
    ];
    for (const c of cases) {
      const r = redact(c);
      expect(r.redacted).toContain('[REDACTED:bearer_token]');
      expect(r.findings.bearer_token).toBeGreaterThanOrEqual(1);
    }
  });

  it('scrubs phone in US dashed + international shapes', () => {
    const r1 = redact('call 415-555-1234 or +1 415 555 1234 today');
    expect(r1.redacted).toContain('[REDACTED:phone]');
    expect(r1.findings.phone).toBeGreaterThanOrEqual(1);
  });

  it('scrubs credit card runs', () => {
    const r = redact('card 4111 1111 1111 1111 expires soon');
    expect(r.redacted).toContain('[REDACTED:credit_card]');
    expect(r.findings.credit_card).toBeGreaterThanOrEqual(1);
  });

  it('respects the classes allowlist (no-op when class disabled)', () => {
    const r = redact('alice@acme.com SSN 123-45-6789', ['email']);
    expect(r.redacted).toBe('[REDACTED:email] SSN 123-45-6789');
    expect(r.findings.email).toBe(1);
    expect(r.findings.ssn).toBe(0);
  });

  it('returns the input unchanged when nothing matches', () => {
    const r = redact('the quick brown fox jumps over the lazy dog');
    expect(r.redacted).toBe('the quick brown fox jumps over the lazy dog');
    expect(totalFindings(r.findings)).toBe(0);
  });
});
