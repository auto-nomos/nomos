import { describe, expect, it } from 'vitest';
import { parsePolicy } from '../parse.js';

describe('parsePolicy', () => {
  it('parses a simple permit policy', () => {
    const result = parsePolicy('permit(principal, action, resource);');
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('parses a multi-policy set', () => {
    const text = `
      permit(principal, action == Action::"read", resource);
      forbid(principal, action == Action::"delete", resource);
    `;
    expect(parsePolicy(text).ok).toBe(true);
  });

  it('parses an empty policy set', () => {
    expect(parsePolicy('').ok).toBe(true);
  });

  it('parses a policy with conditions', () => {
    const text = `permit(principal, action, resource) when { resource.public == true };`;
    expect(parsePolicy(text).ok).toBe(true);
  });

  it('returns errors for malformed policy', () => {
    const result = parsePolicy('permit(principal, action');
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns errors for invalid keyword', () => {
    const result = parsePolicy('grant(principal, action, resource);');
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
