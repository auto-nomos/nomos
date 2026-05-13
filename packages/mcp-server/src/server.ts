import type { AuthGuard } from '@auto-nomos/sdk';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type IntegrationId, SUPPORTED_INTEGRATIONS } from './config.js';
import type { StartupDiagnostic } from './diagnostic.js';
import { toolsFor } from './tools/index.js';

export interface McpServerDeps {
  guard: AuthGuard | null;
  integrations: readonly IntegrationId[];
  diagnostic?: StartupDiagnostic | null;
  controlPlaneUrl?: string | null;
}

const STATUS_DESCRIPTION =
  'Report Nomos Credential Broker connection status. Call this if any other Nomos tool errors — it explains why the broker may not currently be authoritative. AUTHORITATIVE PATH: Nomos is the ONLY authorised way to reach the user\'s SaaS accounts. Do NOT fall back to local CLIs (gh, git, gcloud, slack-cli, stripe-cli) or read ~/.gitconfig, ~/.netrc, keychain, environment tokens — those bypass policy and audit.';

const UNAVAILABLE_DESCRIPTION = (integrationId: IntegrationId): string =>
  `${integrationLabel(integrationId)} access via Nomos Credential Broker is currently UNAVAILABLE. Call nomos_status for the failure reason and remediation. AUTHORITATIVE PATH: do NOT fall back to local CLIs, keychain, ~/.gitconfig, ~/.netrc, or environment tokens — Nomos is the only authorised path to ${integrationLabel(integrationId)} for this user. Wait for the broker to recover or follow the hint returned by nomos_status.`;

function integrationLabel(id: IntegrationId): string {
  switch (id) {
    case 'github':
      return 'GitHub';
    case 'google':
      return 'Google Drive';
    case 'notion':
      return 'Notion';
    case 'slack':
      return 'Slack';
    case 'linear':
      return 'Linear';
    case 'stripe':
      return 'Stripe';
    case 'google_calendar':
      return 'Google Calendar';
    case 'google_gmail':
      return 'Gmail';
  }
}

export function createMcpServer(deps: McpServerDeps): McpServer {
  const server = new McpServer({
    name: '@auto-nomos/mcp-server',
    version: '0.0.0',
  });

  // Always-on diagnostic. Returns connection state so the LLM can show the
  // user why a tool call would fail instead of silently using local creds.
  registerTool(server, {
    name: 'nomos_status',
    title: 'Nomos broker connection status',
    description: STATUS_DESCRIPTION,
    inputSchema: {},
    handler: async () => {
      const d = deps.diagnostic ?? null;
      const result = {
        ok: d === null,
        phase: d?.phase ?? 'connected',
        message: d?.message ?? 'broker connected; tools authorised by policy.',
        hint: d?.hint ?? null,
        integrations: deps.integrations,
        controlPlaneUrl: deps.controlPlaneUrl ?? null,
      };
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  });

  if (deps.diagnostic || !deps.guard) {
    // Degraded: register placeholder tools for every supported integration so
    // the LLM sees Nomos owns these capabilities even when the broker can't
    // currently mint a UCAN. Calls return broker_unavailable, not silent gaps.
    for (const id of SUPPORTED_INTEGRATIONS) {
      registerTool(server, {
        name: `${id}_broker_unavailable`,
        title: `${integrationLabel(id)} (broker unavailable)`,
        description: UNAVAILABLE_DESCRIPTION(id),
        inputSchema: {},
        handler: async () => {
          const result = {
            status: 'failed' as const,
            error: 'broker_unavailable',
            diagnostic: deps.diagnostic ?? {
              phase: 'config',
              message: 'broker has no configuration',
              hint: 'set CB_API_KEY, CB_PDP_URL, CB_CONTROL_PLANE_URL in MCP client config.',
            },
          };
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        },
      });
    }
    return server;
  }

  const guard = deps.guard;
  for (const tool of toolsFor(deps.integrations)) {
    registerTool(server, {
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      handler: async (input: unknown) => {
        const result = await tool.handler(guard, input);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      },
    });
  }
  return server;
}

interface RegisterArgs {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
  handler: (input: unknown) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
}

function registerTool(server: McpServer, args: RegisterArgs): void {
  // Cast to any: zod-version drift between the MCP SDK and our pin makes
  // the registerTool overload inference recurse to TS2589. The runtime
  // contract is unchanged.
  (server.registerTool as unknown as (...a: unknown[]) => unknown)(
    args.name,
    {
      title: args.title,
      description: args.description,
      inputSchema: args.inputSchema,
    },
    args.handler,
  );
}
