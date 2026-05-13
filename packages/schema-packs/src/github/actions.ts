/**
 * Mapping from `packages/adapters/spec/github.yaml` action ids to the
 * canonical Cedar commands the PDP authorizes against. Used by the
 * mcp-server YAML→tool generator and any future code that needs to bridge
 * adapter actions and policy commands.
 *
 * Every adapter action that should be callable as an MCP tool MUST appear
 * here. Actions present in the YAML but absent from this map are skipped
 * by the generator (intentional — lets the adapter define experimental
 * actions before the schema-pack is ready).
 */

export const actionToCommand: Record<string, string> = {
  get_user: '/github/user/read',
  list_repos: '/github/repo/list',
  list_issues: '/github/issue/list',
  get_issue: '/github/issue/read',
  create_repo: '/github/repo/create',
  create_issue: '/github/issue/create',
  comment_on_issue: '/github/issue/comment',
  close_issue: '/github/issue/close',
  delete_repo: '/github/repo/delete',
  get_repo: '/github/repo/read',
  list_branches: '/github/branch/list',
  get_file_contents: '/github/content/read',
  list_prs: '/github/pr/list',
  get_pr: '/github/pr/read',
  create_pr: '/github/pr/create',
  merge_pr: '/github/pr/merge',
};

/**
 * Per-action resource extractor. Returns the `resource` field the SDK
 * sends to the PDP. Cedar policies match on these keys.
 *
 * Convention: include the composite (`repo: "owner/repo"`) so existing
 * starter policies keep matching, AND the granular fields so future
 * policies can match on `resource.owner == "acme"` directly.
 */
export function resourceFor(
  actionId: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const owner = typeof params.owner === 'string' ? params.owner : undefined;
  const repo = typeof params.repo === 'string' ? params.repo : undefined;
  const issueNumber =
    typeof params.issue_number === 'number'
      ? params.issue_number
      : typeof params.issue_number === 'string'
        ? Number(params.issue_number)
        : undefined;

  const base: Record<string, unknown> = {};
  if (owner && repo) {
    base.repo = `${owner}/${repo}`;
    base.owner = owner;
    base.repo_name = repo;
  }
  if (issueNumber !== undefined && !Number.isNaN(issueNumber)) {
    base.issue_number = issueNumber;
  }

  const pullNumber =
    typeof params.pull_number === 'number'
      ? params.pull_number
      : typeof params.pull_number === 'string'
        ? Number(params.pull_number)
        : undefined;
  if (pullNumber !== undefined && !Number.isNaN(pullNumber)) {
    base.pull_number = pullNumber;
  }
  const path = typeof params.path === 'string' ? params.path : undefined;
  if (path) base.path = path;

  switch (actionId) {
    case 'get_user':
    case 'list_repos':
      return {};
    case 'create_repo':
      return {
        ...(typeof params.name === 'string' ? { name: params.name } : {}),
      };
    default:
      return base;
  }
}
