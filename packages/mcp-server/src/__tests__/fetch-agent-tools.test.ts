import { describe, expect, it, vi } from 'vitest';
import { FetchAgentToolsError, fetchAgentTools } from '../fetch-agent-tools.js';

const VALID_KEY = 'cb_22222222-2222-2222-2222-222222222222_secret';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('fetchAgentTools', () => {
  it('parses a valid response', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        agentId: 'agent-1',
        agentName: 'My Agent',
        integrations: ['github', 'slack'],
        commands: ['/github/user/read', '/slack/messages/list'],
      }),
    );
    const tools = await fetchAgentTools({
      controlPlaneUrl: 'https://api.test',
      apiKey: VALID_KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(tools.integrations).toEqual(['github', 'slack']);
    expect(tools.commands).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.test/v1/agent/me/tools',
      expect.objectContaining({
        method: 'GET',
        headers: { authorization: `Bearer ${VALID_KEY}` },
      }),
    );
  });

  it('strips unknown integrations from the response', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        agentId: 'agent-1',
        agentName: null,
        integrations: ['github', 'unknown-saas'],
        commands: [],
      }),
    );
    const tools = await fetchAgentTools({
      controlPlaneUrl: 'https://api.test',
      apiKey: VALID_KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(tools.integrations).toEqual(['github']);
  });

  it('throws on non-2xx', async () => {
    const fetchImpl = vi.fn(async () => new Response('unauthorized', { status: 401 }));
    await expect(
      fetchAgentTools({
        controlPlaneUrl: 'https://api.test',
        apiKey: VALID_KEY,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(FetchAgentToolsError);
  });

  it('throws on network failure', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    await expect(
      fetchAgentTools({
        controlPlaneUrl: 'https://api.test',
        apiKey: VALID_KEY,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(FetchAgentToolsError);
  });

  it('strips trailing slash on controlPlaneUrl', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ agentId: 'a', agentName: null, integrations: [], commands: [] }),
    );
    await fetchAgentTools({
      controlPlaneUrl: 'https://api.test/',
      apiKey: VALID_KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledWith('https://api.test/v1/agent/me/tools', expect.anything());
  });
});
