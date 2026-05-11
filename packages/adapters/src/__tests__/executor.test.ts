import { describe, expect, it, vi } from 'vitest';
import type {
  AdapterCallApiRequest,
  AdapterCallApiResponse,
  AdapterConnector,
} from '../executor.js';
import { AdapterError, executeAction } from '../executor.js';
import type { AdapterSpec } from '../schema.js';

function makeAdapter(): AdapterSpec {
  return {
    id: 'demo',
    name: 'Demo',
    version: '1.0.0',
    auth: {
      kind: 'oauth2',
      authorize_url: 'https://x.com/a',
      token_url: 'https://x.com/t',
      default_scopes: [],
      pkce: true,
    },
    api_base: 'https://api.x.com',
    actions: [
      {
        id: 'list_things',
        description: 'List things',
        expected_use: 'browse',
        auto_execute: true,
        required_scopes: [],
        risk: { category: 'read', sensitivity: 'low' },
        http: { method: 'GET', path: '/repos/{owner}/{repo}/things' },
        params: [
          { name: 'owner', in: 'path', required: true, type: 'string', sensitive: false },
          { name: 'repo', in: 'path', required: true, type: 'string', sensitive: false },
          {
            name: 'state',
            in: 'query',
            required: false,
            type: 'string',
            default: 'open',
            enum: ['open', 'closed'],
            sensitive: false,
          },
        ],
        response: {
          type: 'array',
          sanitize: [{ field: 'items[].user.email', redact: true, hash: false }],
        },
      },
      {
        id: 'create_thing',
        description: 'Create a thing',
        expected_use: 'write',
        auto_execute: false,
        required_scopes: [],
        risk: { category: 'write', sensitivity: 'medium' },
        http: { method: 'POST', path: '/things' },
        params: [
          { name: 'title', in: 'body', required: true, type: 'string', sensitive: false },
          {
            name: 'created_at',
            in: 'body',
            required: false,
            type: 'string',
            default_expr: 'rfc3339(now())',
            sensitive: false,
          },
        ],
        response: { type: 'object', sanitize: [] },
      },
    ],
  };
}

function mockConnector(
  responder: (req: AdapterCallApiRequest) => AdapterCallApiResponse,
): AdapterConnector & { calls: AdapterCallApiRequest[] } {
  const calls: AdapterCallApiRequest[] = [];
  return {
    calls,
    callApi: vi.fn(async (req) => {
      calls.push(req);
      return responder(req);
    }),
  };
}

describe('executor', () => {
  it('substitutes path params + applies query default + dispatches GET', async () => {
    const adapter = makeAdapter();
    const conn = mockConnector(() => ({
      status: 200,
      body: { items: [{ id: 1, user: { email: 'me@x.com' } }] },
    }));
    const result = await executeAction({
      adapter,
      actionId: 'list_things',
      params: { owner: 'me', repo: 'cb' },
      connector: conn,
    });
    expect(conn.calls[0]?.path).toBe('/repos/me/cb/things');
    expect(conn.calls[0]?.method).toBe('GET');
    expect(conn.calls[0]?.query).toEqual({ state: 'open' });
    expect(result.status).toBe(200);
    expect((result.body as { items: { user: { email: string } }[] }).items[0]?.user.email).toBe(
      '[REDACTED]',
    );
    expect((result.raw as { items: { user: { email: string } }[] }).items[0]?.user.email).toBe(
      'me@x.com',
    );
  });

  it('rejects missing required path param', async () => {
    const adapter = makeAdapter();
    const conn = mockConnector(() => ({ status: 200, body: {} }));
    await expect(
      executeAction({
        adapter,
        actionId: 'list_things',
        params: { owner: 'me' },
        connector: conn,
      }),
    ).rejects.toThrow(AdapterError);
  });

  it('rejects enum-violating query param', async () => {
    const adapter = makeAdapter();
    const conn = mockConnector(() => ({ status: 200, body: {} }));
    await expect(
      executeAction({
        adapter,
        actionId: 'list_things',
        params: { owner: 'me', repo: 'cb', state: 'merged' },
        connector: conn,
      }),
    ).rejects.toThrow(/enum/);
  });

  it('resolves default_expr to rfc3339 timestamp', async () => {
    const adapter = makeAdapter();
    const conn = mockConnector(() => ({ status: 201, body: { id: 1 } }));
    await executeAction({
      adapter,
      actionId: 'create_thing',
      params: { title: 'hi' },
      connector: conn,
    });
    const body = conn.calls[0]?.body as Record<string, unknown>;
    expect(body.title).toBe('hi');
    expect(typeof body.created_at).toBe('string');
    expect(String(body.created_at)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('throws action_not_found for unknown id', async () => {
    const adapter = makeAdapter();
    const conn = mockConnector(() => ({ status: 200, body: {} }));
    await expect(
      executeAction({
        adapter,
        actionId: 'no_such',
        params: {},
        connector: conn,
      }),
    ).rejects.toThrow(/action/);
  });
});
