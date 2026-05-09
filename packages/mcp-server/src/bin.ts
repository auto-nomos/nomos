#!/usr/bin/env node
import { createAuthGuard } from '@credential-broker/sdk';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ConfigError, loadConfig } from './config.js';
import { createMcpServer } from './server.js';

async function main(): Promise<void> {
  let config: ReturnType<typeof loadConfig>;
  try {
    config = loadConfig(process.argv.slice(2));
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message);
      console.error('\nUsage:');
      console.error('  credential-broker-mcp --config /path/to/cb-mcp.json');
      console.error(
        '  CB_API_KEY=... CB_PDP_URL=... CB_CONTROL_PLANE_URL=... CB_INTEGRATIONS=github,slack credential-broker-mcp',
      );
      process.exit(2);
    }
    throw err;
  }

  const guard = createAuthGuard({
    apiKey: config.apiKey,
    pdpUrl: config.pdpUrl,
    controlPlaneUrl: config.controlPlaneUrl,
  });
  const server = createMcpServer({ guard, integrations: config.integrations });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `credential-broker-mcp ready (stdio) — integrations: ${config.integrations.join(', ')}`,
  );
}

void main().catch((err) => {
  console.error('fatal startup error', err);
  process.exit(1);
});
