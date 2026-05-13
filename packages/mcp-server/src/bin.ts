#!/usr/bin/env node
import { createAuthGuard } from '@auto-nomos/sdk';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { type Config, ConfigError, loadConfig, SUPPORTED_INTEGRATIONS } from './config.js';
import type { StartupDiagnostic } from './diagnostic.js';
import { FetchAgentToolsError, fetchAgentTools } from './fetch-agent-tools.js';
import { createMcpServer } from './server.js';

async function main(): Promise<void> {
  let config: Config | null = null;
  let diagnostic: StartupDiagnostic | null = null;

  try {
    config = loadConfig(process.argv.slice(2));
  } catch (err) {
    if (err instanceof ConfigError) {
      diagnostic = {
        phase: 'config',
        message: err.message,
        hint: 'set CB_API_KEY, CB_PDP_URL, CB_CONTROL_PLANE_URL in your MCP client config (Cursor settings → MCP), then restart the server.',
      };
      console.error(err.message);
    } else {
      throw err;
    }
  }

  let integrations: readonly string[] = config?.integrations ?? [];
  if (config && integrations.length === 0) {
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
        diagnostic = {
          phase: 'fetch_tools',
          message: err.message,
          hint: 'is the control plane reachable from this machine? check CB_CONTROL_PLANE_URL and your API key in the dashboard.',
        };
        console.error(err.message);
      } else {
        throw err;
      }
    }
  }

  if (config && !diagnostic && integrations.length === 0) {
    diagnostic = {
      phase: 'no_integrations',
      message:
        'agent has no policies mapped — broker is connected but no tools are authorised.',
      hint: 'visit your dashboard → Apps → select this app → Policies → assign one or more, then restart your MCP client.',
    };
    console.error(diagnostic.message);
  }

  const guard = config
    ? createAuthGuard({
        apiKey: config.apiKey,
        pdpUrl: config.pdpUrl,
        controlPlaneUrl: config.controlPlaneUrl,
      })
    : null;

  const server = createMcpServer({
    guard,
    integrations: integrations.filter((id): id is (typeof SUPPORTED_INTEGRATIONS)[number] =>
      SUPPORTED_INTEGRATIONS.includes(id as (typeof SUPPORTED_INTEGRATIONS)[number]),
    ),
    diagnostic,
    controlPlaneUrl: config?.controlPlaneUrl ?? null,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  if (diagnostic) {
    console.error(
      `credential-broker-mcp ready (degraded: ${diagnostic.phase}) — agents must call nomos_status for details.`,
    );
  } else {
    console.error(
      `credential-broker-mcp ready (stdio) — integrations: ${integrations.join(', ')}`,
    );
  }
}

void main().catch((err) => {
  console.error('fatal startup error', err);
  process.exit(1);
});
