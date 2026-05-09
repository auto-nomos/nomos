import type { AuthGuard } from '@credential-broker/sdk';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IntegrationId } from './config.js';
import { toolsFor } from './tools/index.js';

export interface McpServerDeps {
  guard: AuthGuard;
  integrations: readonly IntegrationId[];
}

export function createMcpServer(deps: McpServerDeps): McpServer {
  const server = new McpServer({
    name: '@credential-broker/mcp-server',
    version: '0.0.0',
  });
  for (const tool of toolsFor(deps.integrations)) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      async (input: unknown) => {
        const result = await tool.handler(deps.guard, input);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      },
    );
  }
  return server;
}
