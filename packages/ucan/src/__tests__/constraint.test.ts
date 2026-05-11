import type { ResourceConstraint } from '@auto-nomos/shared-types';
import { describe, expect, it } from 'vitest';
import {
  constraintCovers,
  constraintMatchesResource,
  extractResourceConstraint,
} from '../constraint.js';

describe('extractResourceConstraint', () => {
  it('returns undefined when meta is missing', () => {
    expect(extractResourceConstraint(undefined)).toBeUndefined();
  });

  it('returns undefined when meta lacks resource_constraint', () => {
    expect(extractResourceConstraint({ other: 'value' })).toBeUndefined();
  });

  it('parses a valid filesystem constraint', () => {
    const c = extractResourceConstraint({
      resource_constraint: { provider: 'filesystem', path_prefix: '/safe/' },
    });
    expect(c).toEqual({ provider: 'filesystem', path_prefix: '/safe/' });
  });

  it('parses a valid github constraint', () => {
    const c = extractResourceConstraint({
      resource_constraint: { provider: 'github', owner: 'acme', repo: 'billing' },
    });
    expect(c).toEqual({ provider: 'github', owner: 'acme', repo: 'billing' });
  });

  it('throws on a malformed constraint instead of treating as absent', () => {
    expect(() =>
      extractResourceConstraint({ resource_constraint: { provider: 'unknown' } }),
    ).toThrow();
  });
});

describe('constraintCovers — cross-provider', () => {
  it('rejects filesystem ⊃ github', () => {
    const fs: ResourceConstraint = { provider: 'filesystem', path_prefix: '/' };
    const gh: ResourceConstraint = { provider: 'github', owner: 'acme' };
    expect(constraintCovers(fs, gh)).toBe(false);
    expect(constraintCovers(gh, fs)).toBe(false);
  });
});

describe('constraintCovers — github subset matrix', () => {
  it('owner-only parent covers owner+repo child', () => {
    const parent: ResourceConstraint = { provider: 'github', owner: 'acme' };
    const child: ResourceConstraint = { provider: 'github', owner: 'acme', repo: 'billing' };
    expect(constraintCovers(parent, child)).toBe(true);
  });

  it('owner+repo parent covers owner+repo+pr child', () => {
    const parent: ResourceConstraint = { provider: 'github', owner: 'acme', repo: 'billing' };
    const child: ResourceConstraint = {
      provider: 'github',
      owner: 'acme',
      repo: 'billing',
      pr_number: 42,
    };
    expect(constraintCovers(parent, child)).toBe(true);
  });

  it('rejects different owner', () => {
    const parent: ResourceConstraint = { provider: 'github', owner: 'acme' };
    const child: ResourceConstraint = { provider: 'github', owner: 'globex' };
    expect(constraintCovers(parent, child)).toBe(false);
  });

  it('rejects child broadening from owner+repo to owner-only', () => {
    const parent: ResourceConstraint = { provider: 'github', owner: 'acme', repo: 'billing' };
    const child: ResourceConstraint = { provider: 'github', owner: 'acme' };
    expect(constraintCovers(parent, child)).toBe(false);
  });

  it('rejects child swapping repo within same owner', () => {
    const parent: ResourceConstraint = { provider: 'github', owner: 'acme', repo: 'billing' };
    const child: ResourceConstraint = { provider: 'github', owner: 'acme', repo: 'payroll' };
    expect(constraintCovers(parent, child)).toBe(false);
  });

  it('rejects child with mismatched pr_number', () => {
    const parent: ResourceConstraint = {
      provider: 'github',
      owner: 'acme',
      repo: 'billing',
      pr_number: 7,
    };
    const child: ResourceConstraint = {
      provider: 'github',
      owner: 'acme',
      repo: 'billing',
      pr_number: 8,
    };
    expect(constraintCovers(parent, child)).toBe(false);
  });

  it('path_prefix narrows further', () => {
    const parent: ResourceConstraint = {
      provider: 'github',
      owner: 'acme',
      repo: 'billing',
      path_prefix: 'src/',
    };
    const child: ResourceConstraint = {
      provider: 'github',
      owner: 'acme',
      repo: 'billing',
      path_prefix: 'src/api/',
    };
    expect(constraintCovers(parent, child)).toBe(true);
  });

  it('rejects child that escapes path_prefix', () => {
    const parent: ResourceConstraint = {
      provider: 'github',
      owner: 'acme',
      repo: 'billing',
      path_prefix: 'src/api/',
    };
    const child: ResourceConstraint = {
      provider: 'github',
      owner: 'acme',
      repo: 'billing',
      path_prefix: 'src/',
    };
    expect(constraintCovers(parent, child)).toBe(false);
  });

  it('rejects child missing path_prefix when parent has one', () => {
    const parent: ResourceConstraint = {
      provider: 'github',
      owner: 'acme',
      repo: 'billing',
      path_prefix: 'src/',
    };
    const child: ResourceConstraint = { provider: 'github', owner: 'acme', repo: 'billing' };
    expect(constraintCovers(parent, child)).toBe(false);
  });

  it('ref must match exactly', () => {
    const parent: ResourceConstraint = {
      provider: 'github',
      owner: 'acme',
      repo: 'billing',
      ref: 'main',
    };
    const child: ResourceConstraint = {
      provider: 'github',
      owner: 'acme',
      repo: 'billing',
      ref: 'release',
    };
    expect(constraintCovers(parent, child)).toBe(false);
  });
});

describe('constraintMatchesResource — github', () => {
  const c: ResourceConstraint = { provider: 'github', owner: 'acme', repo: 'billing' };

  it('matches when owner + repo match', () => {
    expect(constraintMatchesResource(c, { owner: 'acme', repo: 'billing' })).toBe(true);
  });

  it('rejects mismatched owner', () => {
    expect(constraintMatchesResource(c, { owner: 'globex', repo: 'billing' })).toBe(false);
  });

  it('rejects mismatched repo', () => {
    expect(constraintMatchesResource(c, { owner: 'acme', repo: 'payroll' })).toBe(false);
  });

  it('owner-only constraint accepts any repo under that owner', () => {
    const ownerOnly: ResourceConstraint = { provider: 'github', owner: 'acme' };
    expect(constraintMatchesResource(ownerOnly, { owner: 'acme', repo: 'billing' })).toBe(true);
    expect(constraintMatchesResource(ownerOnly, { owner: 'acme', repo: 'payroll' })).toBe(true);
    expect(constraintMatchesResource(ownerOnly, { owner: 'globex', repo: 'billing' })).toBe(false);
  });

  it('pr-pinned constraint rejects different pr_number', () => {
    const prPinned: ResourceConstraint = {
      provider: 'github',
      owner: 'acme',
      repo: 'billing',
      pr_number: 42,
    };
    expect(
      constraintMatchesResource(prPinned, { owner: 'acme', repo: 'billing', pr_number: 42 }),
    ).toBe(true);
    expect(
      constraintMatchesResource(prPinned, { owner: 'acme', repo: 'billing', pr_number: 43 }),
    ).toBe(false);
  });

  it('path_prefix narrows on resource.path', () => {
    const pathScoped: ResourceConstraint = {
      provider: 'github',
      owner: 'acme',
      repo: 'billing',
      path_prefix: 'src/api/',
    };
    expect(
      constraintMatchesResource(pathScoped, {
        owner: 'acme',
        repo: 'billing',
        path: 'src/api/users.ts',
      }),
    ).toBe(true);
    expect(
      constraintMatchesResource(pathScoped, {
        owner: 'acme',
        repo: 'billing',
        path: 'src/web/page.tsx',
      }),
    ).toBe(false);
  });
});

describe('constraintMatchesResource — filesystem (regression)', () => {
  it('matches inside prefix', () => {
    const c: ResourceConstraint = { provider: 'filesystem', path_prefix: '/safe/' };
    expect(constraintMatchesResource(c, { path: '/safe/inner.txt' })).toBe(true);
    expect(constraintMatchesResource(c, { path: '/other/file.txt' })).toBe(false);
  });

  it('rejects when host pinned and request omits host', () => {
    const c: ResourceConstraint = {
      provider: 'filesystem',
      path_prefix: '/safe/',
      host: 'laptop',
    };
    expect(constraintMatchesResource(c, { path: '/safe/inner.txt' })).toBe(false);
    expect(constraintMatchesResource(c, { path: '/safe/inner.txt', host: 'laptop' })).toBe(true);
  });
});
