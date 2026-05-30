/**
 * Fetch the calling agent's integration set from the control plane.
 *
 * Used at MCP-server startup when `CB_INTEGRATIONS` is not set — the
 * platform is the single source of truth (an API key resolves to an
 * agent, agent's customer has policies, policies declare integrations).
 *
 * Throws on any network / auth / shape failure; the bin script catches
 * and prints a useful message so the user sees "couldn't reach control
 * plane" instead of a silent empty tool list.
 */
import type { IntegrationId } from './config.js';
import { SUPPORTED_INTEGRATIONS } from './config.js';

export interface AgentTools {
  agentId: string;
  agentName: string | null;
  integrations: IntegrationId[];
  commands: string[];
}

export class FetchAgentToolsError extends Error {
  public readonly reason: unknown;
  constructor(message: string, reason?: unknown) {
    super(message);
    this.name = 'FetchAgentToolsError';
    this.reason = reason;
  }
}

export async function fetchAgentTools(args: {
  controlPlaneUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}): Promise<AgentTools> {
  const f = args.fetchImpl ?? fetch;
  const url = `${args.controlPlaneUrl.replace(/\/$/, '')}/v1/agent/me/tools`;
  let res: Response;
  try {
    res = await f(url, {
      method: 'GET',
      headers: { authorization: `Bearer ${args.apiKey}` },
    });
  } catch (err) {
    throw new FetchAgentToolsError(
      `could not reach control plane at ${url} — is NOMOS_CONTROL_URL correct?`,
      err,
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new FetchAgentToolsError(
      `control plane returned ${res.status} at ${url}${body ? `: ${body}` : ''}`,
    );
  }
  const body = (await res.json().catch(() => null)) as unknown;
  if (!body || typeof body !== 'object') {
    throw new FetchAgentToolsError(`control plane returned non-JSON body at ${url}`);
  }
  const b = body as {
    agentId?: unknown;
    agentName?: unknown;
    integrations?: unknown;
    commands?: unknown;
  };
  if (
    typeof b.agentId !== 'string' ||
    !Array.isArray(b.integrations) ||
    !Array.isArray(b.commands)
  ) {
    throw new FetchAgentToolsError(`control plane returned unexpected shape at ${url}`);
  }
  const integrations = b.integrations.filter((id): id is IntegrationId =>
    SUPPORTED_INTEGRATIONS.includes(id as IntegrationId),
  );
  return {
    agentId: b.agentId,
    agentName: typeof b.agentName === 'string' ? b.agentName : null,
    integrations,
    commands: b.commands.filter((c): c is string => typeof c === 'string'),
  };
}
