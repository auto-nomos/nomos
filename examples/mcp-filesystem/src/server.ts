import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ListPathInput, listPath, ReadPathInput, readPath, type ToolDeps } from './tools.js';

export function createMcpFilesystemServer(deps: ToolDeps): McpServer {
  const server = new McpServer({
    name: 'credential-broker-mcp-filesystem',
    version: '0.0.0',
  });

  server.registerTool(
    'read_path',
    {
      title: 'Read a file under a passkey-confirmed envelope',
      description:
        'Reads bytes from a file. The first read in a new directory family triggers a passkey step-up; subsequent reads inside the approved envelope are silent.',
      inputSchema: ReadPathInput.shape,
    },
    async (input) => {
      const result = await readPath(deps, ReadPathInput.parse(input));
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  );

  server.registerTool(
    'list_path',
    {
      title: 'List directory entries under a passkey-confirmed envelope',
      description: 'Lists files in a directory, gated by the same envelope flow as read_path.',
      inputSchema: ListPathInput.shape,
    },
    async (input) => {
      const result = await listPath(deps, ListPathInput.parse(input));
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  );

  return server;
}
