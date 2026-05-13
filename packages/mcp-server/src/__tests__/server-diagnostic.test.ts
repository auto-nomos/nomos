import type { AuthGuard } from '@auto-nomos/sdk';
import { describe, expect, it, vi } from 'vitest';
import type { StartupDiagnostic } from '../diagnostic.js';
import { createMcpServer } from '../server.js';

/**
 * Internal callable extracted from the MCP server. Both registered tools and
 * placeholders are stored under `_registeredTools` on the SDK's McpServer; we
 * reach in to keep the test transport-agnostic (no stdio dance).
 */
type RegisteredTool = {
  description?: string;
  callback?: (input: unknown) => Promise<{ content: Array<{ text: string }> }>;
  // newer SDK versions
  handler?: (input: unknown) => Promise<{ content: Array<{ text: string }> }>;
  inputSchema?: unknown;
};

function tools(server: ReturnType<typeof createMcpServer>): Record<string, RegisteredTool> {
  // biome-ignore lint/suspicious/noExplicitAny: internal SDK shape
  return (server as any)._registeredTools as Record<string, RegisteredTool>;
}

async function call(t: RegisteredTool): Promise<unknown> {
  const cb = t.callback ?? t.handler;
  if (!cb) throw new Error('tool callback not found');
  const result = await cb({});
  return JSON.parse(result.content[0]!.text);
}

const fakeGuard = {} as AuthGuard;

describe('mcp server diagnostic mode', () => {
  it('always registers nomos_status', () => {
    const server = createMcpServer({
      guard: fakeGuard,
      integrations: ['github'],
    });
    const reg = tools(server);
    expect(reg.nomos_status).toBeDefined();
    expect(reg.nomos_status?.description).toContain('AUTHORITATIVE PATH');
  });

  it('nomos_status returns ok=true when no diagnostic supplied', async () => {
    const server = createMcpServer({
      guard: fakeGuard,
      integrations: ['github'],
      controlPlaneUrl: 'https://cp.example.com',
    });
    const result = (await call(tools(server).nomos_status!)) as {
      ok: boolean;
      phase: string;
      integrations: string[];
      controlPlaneUrl: string | null;
    };
    expect(result.ok).toBe(true);
    expect(result.phase).toBe('connected');
    expect(result.integrations).toEqual(['github']);
    expect(result.controlPlaneUrl).toBe('https://cp.example.com');
  });

  it('registers placeholder tools per supported integration when diagnostic is set', () => {
    const diagnostic: StartupDiagnostic = {
      phase: 'fetch_tools',
      message: 'control plane returned 401 at https://cp/v1/agent/me/tools',
      hint: 'check CB_API_KEY',
    };
    const server = createMcpServer({
      guard: null,
      integrations: [],
      diagnostic,
    });
    const reg = tools(server);
    expect(reg.github_broker_unavailable).toBeDefined();
    expect(reg.slack_broker_unavailable).toBeDefined();
    expect(reg.google_broker_unavailable).toBeDefined();
    expect(reg.notion_broker_unavailable).toBeDefined();
    expect(reg.github_broker_unavailable?.description).toContain('AUTHORITATIVE PATH');
    expect(reg.github_broker_unavailable?.description).toContain('do NOT fall back to local CLIs');
  });

  it('placeholder handler returns broker_unavailable with diagnostic', async () => {
    const diagnostic: StartupDiagnostic = {
      phase: 'config',
      message: 'invalid api key',
      hint: 'set CB_API_KEY',
    };
    const server = createMcpServer({
      guard: null,
      integrations: [],
      diagnostic,
    });
    const result = (await call(tools(server).github_broker_unavailable!)) as {
      status: string;
      error: string;
      diagnostic: StartupDiagnostic;
    };
    expect(result.status).toBe('failed');
    expect(result.error).toBe('broker_unavailable');
    expect(result.diagnostic.phase).toBe('config');
    expect(result.diagnostic.message).toBe('invalid api key');
  });

  it('does not register placeholders in healthy mode', () => {
    const server = createMcpServer({
      guard: fakeGuard,
      integrations: ['github'],
    });
    const reg = tools(server);
    expect(reg.github_broker_unavailable).toBeUndefined();
    // real tools registered instead
    expect(reg.github_get_user).toBeDefined();
  });

  it('healthy-mode tool descriptions assert exclusive authority', () => {
    const server = createMcpServer({
      guard: fakeGuard,
      integrations: ['github'],
    });
    const reg = tools(server);
    const desc = reg.github_get_user?.description ?? '';
    expect(desc).toContain('AUTHORITATIVE PATH');
    expect(desc).toContain('Do NOT fall back to local CLIs');
    expect(desc).toContain('~/.gitconfig');
  });
});
