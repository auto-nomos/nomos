/**
 * GitHub data-plane gate.
 *
 * Sits *between* `decide()` (which validates UCAN+policy) and the
 * existing `oauth.ts` proxy (which calls api.github.com with the
 * customer's OAuth token). The PDP pre-Cedar gate already verifies
 * `request.resource` matches `meta.resource_constraint`, but the agent
 * can still claim the right `resource` while constructing an `apiCall`
 * that hits a *different* repo. This module re-derives the target
 * owner/repo/issue/pr from the upstream URL and refuses anything
 * outside the constraint.
 *
 * Result: a compromised agent cannot use a UCAN scoped to
 * `acme/billing` to read `acme/payroll`, regardless of what `resource`
 * it puts in the authorize body.
 */
import type { GithubConstraint } from '@auto-nomos/shared-types';

export type GithubAdapterFailure =
  | 'owner_mismatch'
  | 'repo_mismatch'
  | 'pr_mismatch'
  | 'issue_mismatch'
  | 'path_outside_constraint'
  | 'ref_mismatch'
  | 'unparseable_path';

export type GithubAdapterResult = { ok: true } | { ok: false; reason: GithubAdapterFailure };

export interface GithubProxyCall {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Parse the leading `/repos/{owner}/{repo}` segment from a GitHub
 * REST path. Returns null when the path doesn't start that way (e.g.
 * `/users/{u}` for user lookups). Caller decides whether `null` should
 * be allowed.
 */
export function parseGithubPath(path: string): {
  owner?: string;
  repo?: string;
  issueNumber?: number;
  prNumber?: number;
  filePath?: string;
} | null {
  if (!path.startsWith('/')) return null;
  const segs = path.split('?')[0]!.split('/').filter(Boolean);
  if (segs[0] !== 'repos') return null;
  const owner = segs[1];
  const repo = segs[2];
  if (!owner || !repo) return null;
  const out: ReturnType<typeof parseGithubPath> = { owner, repo };
  // /repos/{o}/{r}/issues/{n}
  // /repos/{o}/{r}/pulls/{n} (also /pulls/{n}/merge etc.)
  // /repos/{o}/{r}/contents/{path...}
  if (segs[3] === 'issues' && segs[4]) {
    const n = Number.parseInt(segs[4], 10);
    if (Number.isFinite(n)) out.issueNumber = n;
  } else if (segs[3] === 'pulls' && segs[4]) {
    const n = Number.parseInt(segs[4], 10);
    if (Number.isFinite(n)) out.prNumber = n;
  } else if (segs[3] === 'contents' && segs.length > 4) {
    out.filePath = segs.slice(4).join('/');
  }
  return out;
}

export function validateGithubProxyCall(
  constraint: GithubConstraint,
  apiCall: GithubProxyCall,
  query?: Record<string, string>,
): GithubAdapterResult {
  const parsed = parseGithubPath(apiCall.path);
  if (!parsed) {
    // Endpoints outside `/repos/...` (e.g. `/user`, `/orgs/{o}`) are
    // rejected when the constraint scopes to a specific repo. An
    // owner-only constraint allows /orgs/{owner}/... but no other org.
    return { ok: false, reason: 'unparseable_path' };
  }
  if (parsed.owner !== constraint.owner) {
    return { ok: false, reason: 'owner_mismatch' };
  }
  if (constraint.repo !== undefined && parsed.repo !== constraint.repo) {
    return { ok: false, reason: 'repo_mismatch' };
  }
  if (constraint.pr_number !== undefined) {
    if (parsed.prNumber === undefined || parsed.prNumber !== constraint.pr_number) {
      return { ok: false, reason: 'pr_mismatch' };
    }
  }
  if (constraint.issue_number !== undefined) {
    if (parsed.issueNumber === undefined || parsed.issueNumber !== constraint.issue_number) {
      return { ok: false, reason: 'issue_mismatch' };
    }
  }
  if (constraint.path_prefix !== undefined) {
    if (parsed.filePath === undefined || !parsed.filePath.startsWith(constraint.path_prefix)) {
      return { ok: false, reason: 'path_outside_constraint' };
    }
  }
  if (constraint.ref !== undefined) {
    const ref = query?.ref;
    if (ref !== constraint.ref) {
      return { ok: false, reason: 'ref_mismatch' };
    }
  }
  return { ok: true };
}
