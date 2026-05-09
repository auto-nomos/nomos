import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  CreateIssueInput,
  createIssue,
  MergePrInput,
  mergePr,
  ReadRepoInput,
  readRepo,
  type ToolDeps,
} from './tools.js';

export function createMcpGithubServer(deps: ToolDeps): McpServer {
  const server = new McpServer({ name: 'credential-broker-mcp-github', version: '0.0.0' });

  server.registerTool(
    'create_issue',
    {
      title: 'Create a GitHub issue',
      description: 'Creates an issue in a repository (gated by Credential Broker policy).',
      inputSchema: CreateIssueInput.shape,
    },
    async (input) => {
      const result = await createIssue(deps, CreateIssueInput.parse(input));
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  );

  server.registerTool(
    'read_repo',
    {
      title: 'Read repository metadata',
      description: 'Reads basic metadata for a GitHub repository.',
      inputSchema: ReadRepoInput.shape,
    },
    async (input) => {
      const result = await readRepo(deps, ReadRepoInput.parse(input));
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  );

  server.registerTool(
    'merge_pr',
    {
      title: 'Merge a pull request',
      description: 'Merges a pull request (gated by Credential Broker policy).',
      inputSchema: MergePrInput.shape,
    },
    async (input) => {
      const result = await mergePr(deps, MergePrInput.parse(input));
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  );

  return server;
}
