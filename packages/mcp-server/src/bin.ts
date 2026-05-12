#!/usr/bin/env node
import { createAuthGuard } from '@auto-nomos/sdk';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ConfigError, loadConfig } from './config.js';
import { FetchAgentToolsError, fetchAgentTools } from './fetch-agent-tools.js';
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
        '  CB_API_KEY=... CB_PDP_URL=... CB_CONTROL_PLANE_URL=... credential-broker-mcp',
      );
      console.error(
        '\nIntegrations are auto-discovered from your control plane based on the policies attached to your agent. Set CB_INTEGRATIONS=github,slack only as an offline override.',
      );
      process.exit(2);
    }
    throw err;
  }

  // Resolve integrations. If the user didn't pin them via CB_INTEGRATIONS,
  // ask the control plane — that's the single source of truth.
  let integrations = config.integrations;
  if (integrations.length === 0) {
    try {
      const tools = await fetchAgentTools({
        controlPlaneUrl: config.controlPlaneUrl,
        apiKey: config.apiKey,
      });
      integrations = tools.integrations;
      console.error(
        `credential-broker-mcp discovered ${integrations.length} integration${
          integrations.length === 1 ? '' : 's'
        } for agent ${tools.agentName ?? tools.agentId}: ${integrations.join(', ') || '(none)'}`,
      );
    } catch (err) {
      if (err instanceof FetchAgentToolsError) {
        console.error(err.message);
        console.error(
          '\nNo integrations could be discovered. Either:\n  • attach a policy to your agent in the dashboard, OR\n  • set CB_INTEGRATIONS=github,slack as an offline override.',
        );
        process.exit(3);
      }
      throw err;
    }
  }

  if (integrations.length === 0) {
    console.error(
      'credential-broker-mcp: your agent has no policies attached yet — nothing to advertise.',
    );
    console.error(
      'Visit your dashboard → Policies → attach one to this agent, then restart your MCP client.',
    );
    process.exit(4);
  }

  const guard = createAuthGuard({
    apiKey: config.apiKey,
    pdpUrl: config.pdpUrl,
    controlPlaneUrl: config.controlPlaneUrl,
  });
  const server = createMcpServer({ guard, integrations });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`credential-broker-mcp ready (stdio) — integrations: ${integrations.join(', ')}`);
}

void main().catch((err) => {
  console.error('fatal startup error', err);
  process.exit(1);
});
