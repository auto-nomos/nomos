import { parseGithubPath } from './path.js';

/**
 * 2026-05-14 resource_mismatch fix — derive the effective resource
 * (owner, repo, issue#, pr#) from the actual HTTP target the proxy
 * would call. Compared against the agent-declared `request.resource`
 * by `validateResourceConsistency` in the schema-packs root index.
 *
 * Returns null when the path is outside the resource model
 * (`GET /user`, `GET /search/...`, etc.) — those commands legitimately
 * have empty resource and aren't subject to the consistency check.
 */
export function extractResourceFromApiCall(
  _command: string,
  apiCall: { method: string; path: string },
): Record<string, unknown> | null {
  const parsed = parseGithubPath(apiCall.path);
  if (!parsed) return null;
  const out: Record<string, unknown> = {};
  if (parsed.owner) out.owner = parsed.owner;
  if (parsed.repo) out.repo_name = parsed.repo;
  if (parsed.owner && parsed.repo) out.repo = `${parsed.owner}/${parsed.repo}`;
  if (parsed.issueNumber !== undefined) out.issue_number = parsed.issueNumber;
  if (parsed.prNumber !== undefined) out.pull_number = parsed.prNumber;
  return out;
}
