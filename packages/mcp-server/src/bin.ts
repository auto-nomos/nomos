#!/usr/bin/env node
import { createAuthGuard } from '@auto-nomos/sdk';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { type Config, ConfigError, loadConfig, SUPPORTED_INTEGRATIONS } from './config.js';
import type { StartupDiagnostic } from './diagnostic.js';
import { FetchAgentToolsError, fetchAgentTools } from './fetch-agent-tools.js';
import { createMcpServer } from './server.js';

const VALIDATE_FLAGS = new Set(['--validate', '--check', 'validate', 'check']);

function wantsValidate(argv: string[]): boolean {
  return argv.some((a) => VALIDATE_FLAGS.has(a));
}

/**
 * `--validate` / `--check`: prove the config + control-plane wiring is correct
 * without opening the stdio transport. Exits 0 (healthy) or 1 (problem) so it
 * can be used in CI or a "does my MCP config work?" preflight before restarting
 * the client.
 */
async function runValidate(): Promise<never> {
  let config: Config;
  try {
    config = loadConfig(process.argv.slice(2));
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`✗ config: ${err.message}`);
      console.error(
        '  hint: set NOMOS_API_KEY, NOMOS_PDP_URL, NOMOS_CONTROL_URL (or pass --config <file>), then re-run --validate.',
      );
      process.exit(1);
    }
    throw err;
  }
  console.error(`✓ config parsed — control plane ${config.controlPlaneUrl}, pdp ${config.pdpUrl}`);

  try {
    const tools = await fetchAgentTools({
      controlPlaneUrl: config.controlPlaneUrl,
      apiKey: config.apiKey,
    });
    const ints = config.integrations.length ? config.integrations : tools.integrations;
    console.error(
      `✓ control plane reachable — agent ${tools.agentName ?? tools.agentId}, ${ints.length} integration${
        ints.length === 1 ? '' : 's'
      }: ${ints.join(', ') || '(none)'}`,
    );
    if (ints.length === 0) {
      console.error(
        '⚠ agent has no policies mapped — broker connects but authorises no tools. Assign policies in the dashboard.',
      );
    }
    console.error('✓ validate: OK');
    process.exit(0);
  } catch (err) {
    if (err instanceof FetchAgentToolsError) {
      console.error(`✗ control plane: ${err.message}`);
      console.error(
        '  hint: is NOMOS_CONTROL_URL reachable from this machine and the API key valid?',
      );
      process.exit(1);
    }
    throw err;
  }
}

async function main(): Promise<void> {
  if (wantsValidate(process.argv.slice(2))) {
    return runValidate();
  }

  let config: Config | null = null;
  let diagnostic: StartupDiagnostic | null = null;

  try {
    config = loadConfig(process.argv.slice(2));
  } catch (err) {
    if (err instanceof ConfigError) {
      diagnostic = {
        phase: 'config',
        message: err.message,
        hint: 'set NOMOS_API_KEY, NOMOS_PDP_URL, NOMOS_CONTROL_URL in your MCP client config (Cursor settings → MCP), then restart the server.',
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
          hint: 'is the control plane reachable from this machine? check NOMOS_CONTROL_URL and your API key in the dashboard.',
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
      message: 'agent has no policies mapped — broker is connected but no tools are authorised.',
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
    console.error(`credential-broker-mcp ready (stdio) — integrations: ${integrations.join(', ')}`);
  }
}

void main().catch((err) => {
  console.error('fatal startup error', err);
  process.exit(1);
});
