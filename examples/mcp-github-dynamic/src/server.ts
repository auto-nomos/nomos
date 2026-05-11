import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  CreateIssueInput,
  createIssue,
  MergePrInput,
  mergePr,
  ReadIssueInput,
  ReadRepoInput,
  readIssue,
  readRepo,
  type ToolDeps,
} from './tools.js';

export function createMcpGithubDynamicServer(deps: ToolDeps): McpServer {
  const server = new McpServer({
    name: 'credential-broker-mcp-github-dynamic',
    version: '0.0.0',
  });

  server.registerTool(
    'read_repo',
    {
      title: 'Read a GitHub repo via dynamic-scope envelope',
      description:
        'Returns repo metadata. The first read of a new repo triggers a passkey step-up; subsequent calls inside the approved envelope are silent. The OAuth token never leaves the broker.',
      inputSchema: ReadRepoInput.shape,
    },
    async (input) => {
      const result = await readRepo(deps, ReadRepoInput.parse(input));
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  );

  server.registerTool(
    'read_issue',
    {
      title: 'Read a GitHub issue, scoped to a single issue_number',
      description:
        'Reads one issue. Envelope is pinned to {owner, repo, issue_number} — sibling issues require fresh approval.',
      inputSchema: ReadIssueInput.shape,
    },
    async (input) => {
      const result = await readIssue(deps, ReadIssueInput.parse(input));
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  );

  server.registerTool(
    'create_issue',
    {
      title: 'Create a GitHub issue (always step-ups — write verb)',
      description:
        'Creates an issue. Classifier flags `create` as high-risk so this always triggers passkey step-up, even when an envelope is already active.',
      inputSchema: CreateIssueInput.shape,
    },
    async (input) => {
      const result = await createIssue(deps, CreateIssueInput.parse(input));
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  );

  server.registerTool(
    'merge_pr',
    {
      title: 'Merge a GitHub PR (always step-ups — merge verb)',
      description:
        'Merges a PR. High-risk verb plus PR-pinned constraint; sibling PRs cannot ride the same envelope.',
      inputSchema: MergePrInput.shape,
    },
    async (input) => {
      const result = await mergePr(deps, MergePrInput.parse(input));
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  );

  return server;
}
