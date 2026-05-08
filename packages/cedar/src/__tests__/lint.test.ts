import { describe, expect, it, vi } from 'vitest';
import { cedarBinding } from '../binding.js';
import { lintPolicy } from '../lint.js';

describe('lintPolicy', () => {
  it('returns ok with no warnings for a well-formed, formatted policy', () => {
    const text = 'permit (principal, action, resource);';
    const res = lintPolicy(text);
    expect(res.ok).toBe(true);
  });

  it('returns ok with format warning when policy is poorly formatted', () => {
    const text = 'permit(  principal,action,resource\n);';
    const res = lintPolicy(text);
    expect(res.ok).toBe(true);
    expect(res.warnings.some((w) => w.type === 'format')).toBe(true);
  });

  it('returns not ok with parse warnings on malformed policy', () => {
    const res = lintPolicy('permit(principal, action');
    expect(res.ok).toBe(false);
    expect(res.warnings.length).toBeGreaterThan(0);
    expect(res.warnings.every((w) => w.type === 'parse')).toBe(true);
  });

  it('returns ok with no warnings for empty input', () => {
    expect(lintPolicy('').ok).toBe(true);
  });

  it('surfaces formatPolicies failures as format warnings', () => {
    const spy = vi.spyOn(cedarBinding, 'formatPolicies').mockReturnValue({
      type: 'failure',
      errors: [
        {
          message: 'cannot format',
          code: null,
          help: null,
          severity: null,
          url: null,
        },
      ],
    });
    try {
      const res = lintPolicy('permit(principal, action, resource);');
      expect(res.ok).toBe(false);
      expect(res.warnings.some((w) => w.type === 'format' && w.message === 'cannot format')).toBe(
        true,
      );
    } finally {
      spy.mockRestore();
    }
  });
});
