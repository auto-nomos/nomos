/**
 * Parse the leading `/repos/{owner}/{repo}` segment from a GitHub REST
 * path. Returns null when the path doesn't start that way (e.g. `/user`,
 * `/orgs/{o}`, `/search/...`). Caller decides whether `null` should be
 * allowed.
 *
 * Single source of truth — both `apps/pdp/src/adapters/github.ts`
 * (`validateGithubProxyCall`, UCAN-constraint gate) and
 * `packages/schema-packs/src/github/extract.ts`
 * (`extractResourceFromApiCall`, declared-vs-effective gate) re-import
 * this. Drift between the two parsers would mask the same class of
 * resource-mismatch bug that the latter exists to catch.
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
