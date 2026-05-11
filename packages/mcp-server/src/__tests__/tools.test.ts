import type { AuthGuard, MintedUcan } from '@auto-nomos/sdk';
import { describe, expect, it, vi } from 'vitest';
import { toolsFor } from '../tools/index.js';

const minted: MintedUcan = { jwt: 'jwt', cid: 'cid', expiresAt: Date.now() + 600_000 };

interface ProxyCall {
  ucan: string;
  command: string;
  resource: Record<string, unknown>;
  apiCall: { method: string; path: string; body?: unknown; query?: Record<string, string> };
}

function recordingGuard(): { guard: AuthGuard; calls: ProxyCall[] } {
  const calls: ProxyCall[] = [];
  const guard = {
    customerId: '00000000-0000-0000-0000-000000000000',
    authorize: vi.fn(),
    emitReceipt: vi.fn(),
    waitForApproval: vi.fn(),
    mintUcan: vi.fn(async ({ commands }: { commands: string[] }) => {
      const out = new Map<string, MintedUcan>();
      for (const c of commands) out.set(c, minted);
      return out;
    }),
    proxy: vi.fn(async (input: ProxyCall) => {
      calls.push(input);
      return {
        allow: true,
        decision: { allow: true, receiptId: 'r' },
        upstream: { status: 200, body: {}, headers: {} },
      };
    }),
  } as unknown as AuthGuard;
  return { guard, calls };
}

function findTool(name: string) {
  const t = toolsFor(['github', 'slack', 'google', 'notion']).find((d) => d.name === name);
  if (!t) throw new Error(`tool ${name} not registered`);
  return t;
}

describe('tool registry', () => {
  it('exposes the expected tools for each integration', () => {
    const names = toolsFor(['github', 'slack', 'google', 'notion']).map((t) => t.name);
    expect(names).toContain('github_read_repo');
    expect(names).toContain('github_create_issue');
    expect(names).toContain('slack_post_message');
    expect(names).toContain('google_drive_list');
    expect(names).toContain('notion_database_query');
  });

  it('github_create_issue calls /github/issue/create with the right resource', async () => {
    const { guard, calls } = recordingGuard();
    await findTool('github_create_issue').handler(guard, {
      owner: 'acme',
      repo: 'billing',
      title: 'Pay invoice',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe('/github/issue/create');
    expect(calls[0]?.resource).toEqual({ repo: 'acme/billing' });
    expect(calls[0]?.apiCall.method).toBe('POST');
    expect(calls[0]?.apiCall.path).toBe('/repos/acme/billing/issues');
  });

  it('slack_post_message routes to /chat.postMessage', async () => {
    const { guard, calls } = recordingGuard();
    await findTool('slack_post_message').handler(guard, {
      channel: 'C123',
      text: 'hello',
    });
    expect(calls[0]?.command).toBe('/slack/message/post');
    expect(calls[0]?.apiCall.path).toBe('/chat.postMessage');
    expect(calls[0]?.apiCall.body).toEqual({ channel: 'C123', text: 'hello' });
  });

  it('google_drive_list passes query through', async () => {
    const { guard, calls } = recordingGuard();
    await findTool('google_drive_list').handler(guard, { query: 'foo', pageSize: 10 });
    expect(calls[0]?.command).toBe('/google/drive/list');
    expect(calls[0]?.apiCall.path).toBe('/drive/v3/files');
    expect(calls[0]?.apiCall.query).toEqual({ q: 'foo', pageSize: '10' });
  });

  it('notion_database_query routes to /databases/:id/query', async () => {
    const { guard, calls } = recordingGuard();
    await findTool('notion_database_query').handler(guard, {
      databaseId: 'db-1',
      pageSize: 5,
    });
    expect(calls[0]?.command).toBe('/notion/database/query');
    expect(calls[0]?.apiCall.path).toBe('/databases/db-1/query');
    expect(calls[0]?.apiCall.body).toEqual({ page_size: 5 });
  });
});
