import type { GithubConstraint } from '@auto-nomos/shared-types';
import { describe, expect, it } from 'vitest';
import { parseGithubPath, validateGithubProxyCall } from '../adapters/github.js';

describe('parseGithubPath', () => {
  it('extracts owner + repo', () => {
    expect(parseGithubPath('/repos/acme/billing')).toEqual({ owner: 'acme', repo: 'billing' });
  });

  it('extracts pr_number from /pulls/{n}', () => {
    expect(parseGithubPath('/repos/acme/billing/pulls/42')).toEqual({
      owner: 'acme',
      repo: 'billing',
      prNumber: 42,
    });
  });

  it('extracts issue_number from /issues/{n}', () => {
    expect(parseGithubPath('/repos/acme/billing/issues/7')).toEqual({
      owner: 'acme',
      repo: 'billing',
      issueNumber: 7,
    });
  });

  it('extracts contents file path', () => {
    expect(parseGithubPath('/repos/acme/billing/contents/src/api/users.ts')).toEqual({
      owner: 'acme',
      repo: 'billing',
      filePath: 'src/api/users.ts',
    });
  });

  it('returns null for non-/repos paths', () => {
    expect(parseGithubPath('/user')).toBeNull();
    expect(parseGithubPath('/orgs/acme')).toBeNull();
    expect(parseGithubPath('relative/path')).toBeNull();
  });
});

describe('validateGithubProxyCall', () => {
  const repoConstraint: GithubConstraint = {
    provider: 'github',
    owner: 'acme',
    repo: 'billing',
  };

  it('allows in-scope read', () => {
    expect(
      validateGithubProxyCall(repoConstraint, { method: 'GET', path: '/repos/acme/billing' }),
    ).toEqual({ ok: true });
  });

  it('rejects different owner', () => {
    expect(
      validateGithubProxyCall(repoConstraint, { method: 'GET', path: '/repos/globex/billing' }),
    ).toEqual({ ok: false, reason: 'owner_mismatch' });
  });

  it('rejects different repo under same owner', () => {
    expect(
      validateGithubProxyCall(repoConstraint, { method: 'GET', path: '/repos/acme/payroll' }),
    ).toEqual({ ok: false, reason: 'repo_mismatch' });
  });

  it('rejects URL outside /repos when constraint pinned to a repo', () => {
    expect(validateGithubProxyCall(repoConstraint, { method: 'GET', path: '/user' })).toEqual({
      ok: false,
      reason: 'unparseable_path',
    });
  });

  it('pr-pinned constraint rejects pr_number mismatch', () => {
    const pr: GithubConstraint = {
      provider: 'github',
      owner: 'acme',
      repo: 'billing',
      pr_number: 42,
    };
    expect(
      validateGithubProxyCall(pr, { method: 'GET', path: '/repos/acme/billing/pulls/42' }),
    ).toEqual({ ok: true });
    expect(
      validateGithubProxyCall(pr, { method: 'GET', path: '/repos/acme/billing/pulls/43' }),
    ).toEqual({ ok: false, reason: 'pr_mismatch' });
  });

  it('path_prefix narrows /contents/...', () => {
    const c: GithubConstraint = {
      provider: 'github',
      owner: 'acme',
      repo: 'billing',
      path_prefix: 'src/api/',
    };
    expect(
      validateGithubProxyCall(c, {
        method: 'GET',
        path: '/repos/acme/billing/contents/src/api/users.ts',
      }),
    ).toEqual({ ok: true });
    expect(
      validateGithubProxyCall(c, {
        method: 'GET',
        path: '/repos/acme/billing/contents/src/web/page.tsx',
      }),
    ).toEqual({ ok: false, reason: 'path_outside_constraint' });
  });

  it('ref-pinned constraint rejects mismatch on ?ref=', () => {
    const c: GithubConstraint = {
      provider: 'github',
      owner: 'acme',
      repo: 'billing',
      ref: 'main',
    };
    expect(
      validateGithubProxyCall(
        c,
        { method: 'GET', path: '/repos/acme/billing/contents/README.md' },
        { ref: 'main' },
      ),
    ).toEqual({ ok: true });
    expect(
      validateGithubProxyCall(
        c,
        { method: 'GET', path: '/repos/acme/billing/contents/README.md' },
        { ref: 'release' },
      ),
    ).toEqual({ ok: false, reason: 'ref_mismatch' });
  });
});
