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
  it('exposes the full YAML action surface for each integration', () => {
    const names = toolsFor(['github', 'slack', 'google', 'notion']).map((t) => t.name);
    // github — superset of YAML actions (incl. comment_on_issue, close_issue, delete_repo)
    expect(names).toContain('github_get_user');
    expect(names).toContain('github_list_repos');
    expect(names).toContain('github_list_issues');
    expect(names).toContain('github_get_issue');
    expect(names).toContain('github_create_repo');
    expect(names).toContain('github_create_issue');
    expect(names).toContain('github_comment_on_issue');
    expect(names).toContain('github_close_issue');
    expect(names).toContain('github_delete_repo');
    // slack
    expect(names).toContain('slack_list_channels');
    expect(names).toContain('slack_post_message');
    expect(names).toContain('slack_get_user_info');
    expect(names).toContain('slack_list_recent_messages');
    expect(names).toContain('slack_react_to_message');
    // google drive
    expect(names).toContain('google_list_files');
    expect(names).toContain('google_get_file');
    expect(names).toContain('google_download_file');
    expect(names).toContain('google_create_file');
    expect(names).toContain('google_delete_file');
    // notion
    expect(names).toContain('notion_search');
    expect(names).toContain('notion_get_page');
    expect(names).toContain('notion_list_block_children');
    expect(names).toContain('notion_append_block_children');
    expect(names).toContain('notion_create_page');
    expect(names).toContain('notion_query_database');
  });

  it('github_create_issue calls /github/issue/create with composite + granular resource', async () => {
    const { guard, calls } = recordingGuard();
    await findTool('github_create_issue').handler(guard, {
      owner: 'acme',
      repo: 'billing',
      title: 'Pay invoice',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe('/github/issue/create');
    expect(calls[0]?.resource).toEqual({
      repo: 'acme/billing',
      owner: 'acme',
      repo_name: 'billing',
    });
    expect(calls[0]?.apiCall.method).toBe('POST');
    expect(calls[0]?.apiCall.path).toBe('/repos/acme/billing/issues');
    expect(calls[0]?.apiCall.body).toMatchObject({ title: 'Pay invoice' });
  });

  it('github_comment_on_issue (new tool) hits /github/issue/comment', async () => {
    const { guard, calls } = recordingGuard();
    await findTool('github_comment_on_issue').handler(guard, {
      owner: 'acme',
      repo: 'billing',
      issue_number: 7,
      body: 'ack',
    });
    expect(calls[0]?.command).toBe('/github/issue/comment');
    expect(calls[0]?.apiCall.method).toBe('POST');
    expect(calls[0]?.apiCall.path).toBe('/repos/acme/billing/issues/7/comments');
    expect(calls[0]?.resource).toMatchObject({ repo: 'acme/billing', issue_number: 7 });
  });

  it('github_delete_repo (high-risk) is registered and addressable', async () => {
    const { guard, calls } = recordingGuard();
    await findTool('github_delete_repo').handler(guard, { owner: 'acme', repo: 'billing' });
    expect(calls[0]?.command).toBe('/github/repo/delete');
    expect(calls[0]?.apiCall.method).toBe('DELETE');
    expect(calls[0]?.apiCall.path).toBe('/repos/acme/billing');
  });

  it('slack_post_message routes to /chat.postMessage', async () => {
    const { guard, calls } = recordingGuard();
    await findTool('slack_post_message').handler(guard, {
      channel: 'C123',
      text: 'hello',
    });
    expect(calls[0]?.command).toBe('/slack/message/post');
    expect(calls[0]?.apiCall.path).toBe('/chat.postMessage');
    expect(calls[0]?.apiCall.body).toMatchObject({ channel: 'C123', text: 'hello' });
  });

  it('google_list_files passes q + pageSize as query params', async () => {
    const { guard, calls } = recordingGuard();
    await findTool('google_list_files').handler(guard, { q: 'foo', pageSize: 10 });
    expect(calls[0]?.command).toBe('/google/drive/list');
    expect(calls[0]?.apiCall.path).toBe('/files');
    expect(calls[0]?.apiCall.query).toMatchObject({ q: 'foo', pageSize: '10' });
  });

  it('notion_query_database routes to /databases/:id/query', async () => {
    const { guard, calls } = recordingGuard();
    await findTool('notion_query_database').handler(guard, {
      database_id: 'db-1',
      page_size: 5,
    });
    expect(calls[0]?.command).toBe('/notion/database/query');
    expect(calls[0]?.apiCall.path).toBe('/databases/db-1/query');
    expect(calls[0]?.apiCall.body).toMatchObject({ page_size: 5 });
  });
});
