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
import { parseGithubPath } from '@auto-nomos/schema-packs/github/path';
import type { GithubConstraint } from '@auto-nomos/shared-types';

export { parseGithubPath };

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
