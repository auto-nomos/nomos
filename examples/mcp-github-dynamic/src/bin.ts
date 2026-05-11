#!/usr/bin/env node
import { type AuthGuard, createAuthGuard, createIntentClient } from '@auto-nomos/sdk';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpGithubDynamicServer } from './server.js';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`missing env var: ${name}`);
    process.exit(1);
  }
  return v;
}

/**
 * Stdio MCP hosts (Claude Desktop) own stdin/stdout. We can't paste a
 * cosigner JWT — the dashboard writes it after passkey approval and
 * the SDK's `waitForApproval` polls /v1/stepup/:id for it.
 */
function makePollingResolver(guard: AuthGuard, timeoutMs: number) {
  return async (stepUpId: string, stepUpUrl: string): Promise<string> => {
    process.stderr.write(
      `\n[mcp-github-dynamic] step-up required\n  id: ${stepUpId}\n  approve at: ${stepUpUrl}\n  waiting up to ${Math.round(timeoutMs / 1000)}s for passkey...\n`,
    );
    const status = await guard.waitForApproval({ stepUpId, timeoutMs, pollIntervalMs: 1500 });
    if (status.state !== 'approved' || !status.cosignerJwt) {
      throw new Error(`step-up ${status.state} (no cosigner JWT)`);
    }
    process.stderr.write(`[mcp-github-dynamic] approved — minting envelope\n`);
    return status.cosignerJwt;
  };
}

async function main(): Promise<void> {
  const apiKey = requireEnv('CB_API_KEY');
  const pdpUrl = process.env.CB_PDP_URL ?? 'http://localhost:8787';
  const controlPlaneUrl = process.env.CB_CONTROL_PLANE_URL ?? 'http://localhost:8788';
  const stepUpTimeoutMs = Number.parseInt(process.env.CB_STEPUP_TIMEOUT_MS ?? '300000', 10);

  const guard = createAuthGuard({ apiKey, pdpUrl, controlPlaneUrl });
  const intent = createIntentClient({ apiKey, controlPlaneUrl });
  const server = createMcpGithubDynamicServer({
    guard,
    intent,
    awaitApproval: makePollingResolver(guard, stepUpTimeoutMs),
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('mcp-github-dynamic ready (stdio)');
}

void main().catch((err) => {
  console.error('fatal startup error', err);
  process.exit(1);
});
