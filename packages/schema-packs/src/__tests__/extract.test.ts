import { describe, expect, it } from 'vitest';
import { extractResourceFromApiCall } from '../github/extract.js';
import { githubPack } from '../github/index.js';
import { parseGithubPath } from '../github/path.js';
import { validateResourceConsistency } from '../index.js';

describe('parseGithubPath (relocated from apps/pdp/src/adapters/github.ts)', () => {
  it('parses /repos/{owner}/{repo}', () => {
    expect(parseGithubPath('/repos/acme/billing')).toEqual({ owner: 'acme', repo: 'billing' });
  });

  it('parses /repos/{o}/{r}/contents/{path}', () => {
    expect(parseGithubPath('/repos/a/b/contents/docs/readme.md')).toEqual({
      owner: 'a',
      repo: 'b',
      filePath: 'docs/readme.md',
    });
  });

  it('parses /repos/{o}/{r}/issues/{n}', () => {
    expect(parseGithubPath('/repos/a/b/issues/42')).toEqual({
      owner: 'a',
      repo: 'b',
      issueNumber: 42,
    });
  });

  it('parses /repos/{o}/{r}/pulls/{n}/merge', () => {
    expect(parseGithubPath('/repos/a/b/pulls/7/merge')).toEqual({
      owner: 'a',
      repo: 'b',
      prNumber: 7,
    });
  });

  it('returns null for /user', () => {
    expect(parseGithubPath('/user')).toBeNull();
  });

  it('returns null for /search/repositories', () => {
    expect(parseGithubPath('/search/repositories')).toBeNull();
  });

  it('returns null for paths missing leading slash', () => {
    expect(parseGithubPath('repos/a/b')).toBeNull();
  });
});

describe('extractResourceFromApiCall (github pack)', () => {
  it('extracts owner+repo+repo for /repos/{o}/{r}/contents/{path}', () => {
    expect(
      extractResourceFromApiCall('/github/content/update', {
        method: 'PUT',
        path: '/repos/acme/billing/contents/docs/x.md',
      }),
    ).toEqual({ owner: 'acme', repo_name: 'billing', repo: 'acme/billing' });
  });

  it('extracts issue_number for /repos/{o}/{r}/issues/{n}', () => {
    expect(
      extractResourceFromApiCall('/github/issue/read', {
        method: 'GET',
        path: '/repos/acme/billing/issues/12',
      }),
    ).toEqual({
      owner: 'acme',
      repo_name: 'billing',
      repo: 'acme/billing',
      issue_number: 12,
    });
  });

  it('returns null for /user (no path-bound resource)', () => {
    expect(
      extractResourceFromApiCall('/github/user/read', { method: 'GET', path: '/user' }),
    ).toBeNull();
  });

  it('is wired onto githubPack', () => {
    expect(githubPack.extractResourceFromApiCall).toBe(extractResourceFromApiCall);
  });
});

describe('validateResourceConsistency', () => {
  it('allows consistent declared vs effective', () => {
    expect(
      validateResourceConsistency(
        '/github/content/update',
        { owner: 'acme', repo_name: 'billing' },
        { method: 'PUT', path: '/repos/acme/billing/contents/foo.txt' },
      ),
    ).toEqual({ ok: true });
  });

  it('denies mismatched owner', () => {
    const r = validateResourceConsistency(
      '/github/content/update',
      { owner: 'octocat', repo_name: 'Hello-World' },
      { method: 'PUT', path: '/repos/admin/test-repo/contents/x.txt' },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('resource_mismatch');
    expect(r.field).toBe('owner');
    expect(r.declared).toBe('octocat');
    expect(r.effective).toBe('admin');
  });

  it('denies mismatched repo_name when owner matches', () => {
    const r = validateResourceConsistency(
      '/github/issue/create',
      { owner: 'acme', repo_name: 'billing' },
      { method: 'POST', path: '/repos/acme/payroll/issues' },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.field).toBe('repo_name');
  });

  it('denies mismatched issue_number', () => {
    const r = validateResourceConsistency(
      '/github/issue/comment',
      { owner: 'a', repo_name: 'b', issue_number: 1 },
      { method: 'POST', path: '/repos/a/b/issues/2/comments' },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.field).toBe('issue_number');
  });

  it('passes when declared resource omits the key (Cedar still gates)', () => {
    expect(
      validateResourceConsistency(
        '/github/content/update',
        {},
        { method: 'PUT', path: '/repos/acme/billing/contents/x.txt' },
      ),
    ).toEqual({ ok: true });
  });

  it('passes when apiCall has no path-bound resource (e.g. /user)', () => {
    expect(
      validateResourceConsistency(
        '/github/user/read',
        { owner: 'anything' },
        { method: 'GET', path: '/user' },
      ),
    ).toEqual({ ok: true });
  });

  it('passes for packs without an extractor (back-compat)', () => {
    // slack pack has no extractor → pass-through.
    expect(
      validateResourceConsistency(
        '/slack/message/post',
        { channel: 'C123' },
        { method: 'POST', path: '/api/chat.postMessage' },
      ),
    ).toEqual({ ok: true });
  });
});
