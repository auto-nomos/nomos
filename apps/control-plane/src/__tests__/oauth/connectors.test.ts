/**
 * Per-connector behavior tests using a mock fetch. We assert the exact request
 * shape (URL, method, headers, body) and verify the connector turns each
 * provider's response shape into the canonical OAuthTokens.
 */
import { describe, expect, it } from 'vitest';
import { ConnectorAuthError, type ConnectorContext } from '../../oauth/connector.js';
import {
  ALL_CONNECTOR_IDS,
  connectorRegistry,
  getConnector,
} from '../../oauth/connectors/index.js';

interface MockCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

function makeFetch(handlers: Record<string, () => Response | Promise<Response>>): {
  fetch: typeof fetch;
  calls: MockCall[];
} {
  const calls: MockCall[] = [];
  const f: typeof fetch = async (url, init) => {
    const u = String(url);
    calls.push({
      url: u,
      method: init?.method ?? 'GET',
      headers: (init?.headers as Record<string, string>) ?? {},
      body: typeof init?.body === 'string' ? init.body : undefined,
    });
    const handler =
      Object.entries(handlers).find(([prefix]) => u.startsWith(prefix))?.[1] ??
      (() => new Response('not mocked', { status: 599 }));
    return handler();
  };
  return { fetch: f, calls };
}

function ctx(fetchImpl: typeof fetch): ConnectorContext {
  return {
    fetch: fetchImpl,
    clientId: 'CLIENT_ID',
    clientSecret: 'CLIENT_SECRET',
    redirectUri: 'https://cb.test/v1/oauth/callback/x',
  };
}

describe('connectorRegistry', () => {
  it('exposes every implemented connector', () => {
    for (const id of ALL_CONNECTOR_IDS) {
      expect(connectorRegistry[id].id).toBe(id);
    }
  });

  it('getConnector throws on unknown id', () => {
    expect(() => getConnector('salesforce' as never)).toThrow(/unknown connector/);
  });
});

describe('github connector', () => {
  const c = getConnector('github');

  it('authUrl includes client_id, redirect_uri, scopes, state', () => {
    const url = new URL(c.authUrl(ctx(fetch), { state: 'st1', scopes: ['repo'] }));
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('CLIENT_ID');
    expect(url.searchParams.get('redirect_uri')).toBe('https://cb.test/v1/oauth/callback/x');
    expect(url.searchParams.get('scope')).toBe('repo');
    expect(url.searchParams.get('state')).toBe('st1');
  });

  it('exchangeCode round-trips access + refresh + scope + login', async () => {
    const { fetch: f, calls } = makeFetch({
      'https://github.com/login/oauth/access_token': () =>
        new Response(
          JSON.stringify({
            access_token: 'gho_abc',
            refresh_token: 'ghr_xyz',
            expires_in: 28800,
            refresh_token_expires_in: 15897600,
            scope: 'repo read:user',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      'https://api.github.com/user': () =>
        new Response(JSON.stringify({ login: 'octocat', id: 1 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    const tokens = await c.exchangeCode(ctx(f), 'auth_code_1');
    expect(tokens.accessToken).toBe('gho_abc');
    expect(tokens.refreshToken).toBe('ghr_xyz');
    expect(tokens.scopesGranted).toEqual(['read:user', 'repo']);
    expect(tokens.accountId).toBe('octocat');
    expect(tokens.accessTokenExpiresAt).toBeInstanceOf(Date);
    expect(tokens.refreshTokenExpiresAt).toBeInstanceOf(Date);
    // First call to token endpoint, second to /user with bearer.
    expect(calls[0].body).toContain('client_id=CLIENT_ID');
    expect(calls[0].body).toContain('code=auth_code_1');
    expect(calls[1].headers.authorization).toBe('Bearer gho_abc');
  });

  it('exchangeCode throws when github returns {"error":"bad_code"}', async () => {
    const { fetch: f } = makeFetch({
      'https://github.com/login/oauth/access_token': () =>
        new Response(JSON.stringify({ error: 'bad_verification_code' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    await expect(c.exchangeCode(ctx(f), 'bad')).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('refresh throws when no refresh token stored', async () => {
    await expect(c.refresh(ctx(fetch), '')).rejects.toMatchObject({
      message: /re-authentication required/,
    });
  });

  it('refresh calls token endpoint with grant_type=refresh_token', async () => {
    const { fetch: f, calls } = makeFetch({
      'https://github.com/login/oauth/access_token': () =>
        new Response(
          JSON.stringify({
            access_token: 'gho_new',
            refresh_token: 'ghr_new',
            scope: 'repo',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      'https://api.github.com/user': () =>
        new Response(JSON.stringify({ login: 'octocat' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    const tokens = await c.refresh(ctx(f), 'ghr_old');
    expect(tokens.accessToken).toBe('gho_new');
    expect(calls[0].body).toContain('grant_type=refresh_token');
    expect(calls[0].body).toContain('refresh_token=ghr_old');
  });

  it('callApi sets bearer + github headers and returns parsed body', async () => {
    const { fetch: f, calls } = makeFetch({
      'https://api.github.com/repos/acme/repo/issues': () =>
        new Response(JSON.stringify({ number: 7 }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
    });
    const res = await c.callApi(ctx(f), 'gho_x', {
      method: 'POST',
      path: '/repos/acme/repo/issues',
      body: { title: 'hi' },
    });
    expect(res.status).toBe(201);
    expect((res.body as { number: number }).number).toBe(7);
    expect(calls[0].headers.authorization).toBe('Bearer gho_x');
    expect(calls[0].headers['x-github-api-version']).toBe('2022-11-28');
    expect(calls[0].body).toBe('{"title":"hi"}');
  });
});

describe('slack connector', () => {
  const c = getConnector('slack');

  it('authUrl uses comma-delimited scopes', () => {
    const url = new URL(
      c.authUrl(ctx(fetch), { state: 's', scopes: ['chat:write', 'channels:read'] }),
    );
    expect(url.searchParams.get('scope')).toBe('chat:write,channels:read');
  });

  it('exchangeCode parses team.id as accountId', async () => {
    const { fetch: f } = makeFetch({
      'https://slack.com/api/oauth.v2.access': () =>
        new Response(
          JSON.stringify({
            ok: true,
            access_token: 'xoxb_x',
            refresh_token: 'xoxe_y',
            expires_in: 43200,
            scope: 'chat:write,channels:read',
            team: { id: 'T123' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    });
    const tokens = await c.exchangeCode(ctx(f), 'code1');
    expect(tokens.accountId).toBe('T123');
    expect(tokens.scopesGranted).toEqual(['channels:read', 'chat:write']);
    expect(tokens.refreshToken).toBe('xoxe_y');
  });

  it('exchangeCode throws when {"ok":false}', async () => {
    const { fetch: f } = makeFetch({
      'https://slack.com/api/oauth.v2.access': () =>
        new Response(JSON.stringify({ ok: false, error: 'invalid_code' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    await expect(c.exchangeCode(ctx(f), 'bad')).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('callApi targets slack.com/api', async () => {
    const { fetch: f, calls } = makeFetch({
      'https://slack.com/api/chat.postMessage': () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    const res = await c.callApi(ctx(f), 'xoxb', {
      method: 'POST',
      path: '/chat.postMessage',
      body: { channel: 'C1', text: 'hi' },
    });
    expect(res.status).toBe(200);
    expect(calls[0].url).toBe('https://slack.com/api/chat.postMessage');
    expect(calls[0].headers['content-type']).toBe('application/json; charset=utf-8');
  });
});

describe('google connector', () => {
  const c = getConnector('google');

  it('authUrl forces access_type=offline + prompt=consent', () => {
    const url = new URL(c.authUrl(ctx(fetch), { state: 's' }));
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('response_type')).toBe('code');
  });

  it('exchangeCode looks up sub from userinfo for accountId', async () => {
    const { fetch: f } = makeFetch({
      'https://oauth2.googleapis.com/token': () =>
        new Response(
          JSON.stringify({
            access_token: 'ya29.x',
            refresh_token: 'rt_y',
            expires_in: 3599,
            scope: 'https://www.googleapis.com/auth/drive.readonly',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      'https://www.googleapis.com/oauth2/v3/userinfo': () =>
        new Response(JSON.stringify({ sub: 'g-1234', email: 'a@b.test' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    const tokens = await c.exchangeCode(ctx(f), 'code1');
    expect(tokens.accountId).toBe('g-1234');
    expect(tokens.refreshToken).toBe('rt_y');
  });

  it('refresh preserves existing refresh_token when google omits it', async () => {
    const { fetch: f } = makeFetch({
      'https://oauth2.googleapis.com/token': () =>
        new Response(
          JSON.stringify({
            access_token: 'ya29.new',
            expires_in: 3600,
            scope: 'https://www.googleapis.com/auth/drive.readonly',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      'https://www.googleapis.com/oauth2/v3/userinfo': () =>
        new Response(JSON.stringify({ sub: 'g-1234' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    const tokens = await c.refresh(ctx(f), 'rt_kept');
    expect(tokens.refreshToken).toBe('rt_kept');
  });

  it('refresh throws when stored refresh token is empty', async () => {
    await expect(c.refresh(ctx(fetch), '')).rejects.toMatchObject({
      message: /re-consent with access_type=offline required/,
    });
  });
});

describe('notion connector', () => {
  const c = getConnector('notion');

  it('authUrl includes owner=user', () => {
    const url = new URL(c.authUrl(ctx(fetch), { state: 's' }));
    expect(url.searchParams.get('owner')).toBe('user');
  });

  it('exchangeCode uses Basic auth + Notion-Version header', async () => {
    let captured: MockCall | undefined;
    const { fetch: f } = makeFetch({
      'https://api.notion.com/v1/oauth/token': () => {
        return new Response(
          JSON.stringify({
            access_token: 'secret_x',
            workspace_id: 'ws_1',
            bot_id: 'bot_1',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });
    const cFetch: typeof fetch = async (url, init) => {
      captured = {
        url: String(url),
        method: init?.method ?? 'GET',
        headers: (init?.headers as Record<string, string>) ?? {},
        body: typeof init?.body === 'string' ? init.body : undefined,
      };
      return f(url, init);
    };
    const tokens = await c.exchangeCode(ctx(cFetch), 'code1');
    expect(tokens.accessToken).toBe('secret_x');
    expect(tokens.accountId).toBe('ws_1');
    expect(tokens.refreshToken).toBe('');
    expect(captured?.headers.authorization).toBe(
      `Basic ${Buffer.from('CLIENT_ID:CLIENT_SECRET').toString('base64')}`,
    );
    expect(captured?.headers['notion-version']).toBe('2022-06-28');
  });

  it('refresh always throws (notion has no refresh tokens)', async () => {
    await expect(c.refresh(ctx(fetch), 'anything')).rejects.toMatchObject({
      message: /does not issue refresh tokens/,
    });
  });

  it('callApi adds Notion-Version header to API requests', async () => {
    const { fetch: f, calls } = makeFetch({
      'https://api.notion.com/v1/pages': () =>
        new Response(JSON.stringify({ object: 'page' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    const res = await c.callApi(ctx(f), 'secret_x', { method: 'GET', path: '/pages' });
    expect(res.status).toBe(200);
    expect(calls[0].headers['notion-version']).toBe('2022-06-28');
  });

  it('callApi serializes query params + body for POST', async () => {
    const { fetch: f, calls } = makeFetch({
      'https://api.notion.com/v1/databases/db1/query': () =>
        new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    await c.callApi(ctx(f), 'secret_x', {
      method: 'POST',
      path: '/databases/db1/query',
      query: { start_cursor: 'abc' },
      body: { filter: { property: 'Name' } },
    });
    expect(calls[0].url).toContain('start_cursor=abc');
    expect(calls[0].body).toBe('{"filter":{"property":"Name"}}');
    expect(calls[0].headers['content-type']).toBe('application/json');
  });

  it('exchangeCode throws when access_token is missing', async () => {
    const { fetch: f } = makeFetch({
      'https://api.notion.com/v1/oauth/token': () =>
        new Response(JSON.stringify({ error: 'invalid_code' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    await expect(c.exchangeCode(ctx(f), 'bad')).rejects.toBeInstanceOf(ConnectorAuthError);
  });
});

describe('google connector — callApi', () => {
  const c = getConnector('google');

  it('targets www.googleapis.com with bearer + query params', async () => {
    const { fetch: f, calls } = makeFetch({
      'https://www.googleapis.com/drive/v3/files': () =>
        new Response(JSON.stringify({ files: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    const res = await c.callApi(ctx(f), 'ya29.x', {
      method: 'GET',
      path: '/drive/v3/files',
      query: { q: "name = 'foo'" },
    });
    expect(res.status).toBe(200);
    expect(calls[0].url).toContain('https://www.googleapis.com/drive/v3/files');
    expect(calls[0].url).toContain('q=name+%3D+%27foo%27');
    expect(calls[0].headers.authorization).toBe('Bearer ya29.x');
  });

  it('serializes JSON body on POST', async () => {
    const { fetch: f, calls } = makeFetch({
      'https://www.googleapis.com/drive/v3/files': () =>
        new Response(JSON.stringify({ id: 'fid' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    await c.callApi(ctx(f), 'tok', {
      method: 'POST',
      path: '/drive/v3/files',
      body: { name: 'doc.txt' },
    });
    expect(calls[0].body).toBe('{"name":"doc.txt"}');
    expect(calls[0].headers['content-type']).toBe('application/json');
  });

  it('exchangeCode rejects when missing access_token', async () => {
    const { fetch: f } = makeFetch({
      'https://oauth2.googleapis.com/token': () =>
        new Response(JSON.stringify({ error: 'invalid_grant' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    await expect(c.exchangeCode(ctx(f), 'bad')).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('refresh rejects when token endpoint omits access_token', async () => {
    const { fetch: f } = makeFetch({
      'https://oauth2.googleapis.com/token': () =>
        new Response(JSON.stringify({ error: 'invalid_token' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    await expect(c.refresh(ctx(f), 'rt_x')).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('userinfo failure during exchange surfaces ConnectorAuthError', async () => {
    const { fetch: f } = makeFetch({
      'https://oauth2.googleapis.com/token': () =>
        new Response(
          JSON.stringify({
            access_token: 'ya29.x',
            refresh_token: 'rt',
            expires_in: 3600,
            scope: '',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      'https://www.googleapis.com/oauth2/v3/userinfo': () =>
        new Response('forbidden', { status: 403 }),
    });
    await expect(c.exchangeCode(ctx(f), 'code')).rejects.toMatchObject({
      status: 403,
    });
  });
});

describe('slack connector — additional', () => {
  const c = getConnector('slack');

  it('refresh rejects when refresh token empty', async () => {
    await expect(c.refresh(ctx(fetch), '')).rejects.toMatchObject({
      message: /token rotation not enabled/,
    });
  });

  it('refresh round-trips on successful response', async () => {
    const { fetch: f, calls } = makeFetch({
      'https://slack.com/api/oauth.v2.access': () =>
        new Response(
          JSON.stringify({
            ok: true,
            access_token: 'xoxb_new',
            refresh_token: 'xoxe_new',
            expires_in: 43200,
            scope: 'chat:write',
            team: { id: 'T1' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    });
    const tokens = await c.refresh(ctx(f), 'xoxe_old');
    expect(tokens.accessToken).toBe('xoxb_new');
    expect(calls[0].body).toContain('refresh_token=xoxe_old');
  });

  it('callApi GET uses query params', async () => {
    const { fetch: f, calls } = makeFetch({
      'https://slack.com/api/conversations.list': () =>
        new Response(JSON.stringify({ ok: true, channels: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    await c.callApi(ctx(f), 'xoxb', {
      method: 'GET',
      path: '/conversations.list',
      query: { limit: '50' },
    });
    expect(calls[0].url).toContain('limit=50');
  });

  it('exchangeCode falls back to top-level team_id when team object absent', async () => {
    const { fetch: f } = makeFetch({
      'https://slack.com/api/oauth.v2.access': () =>
        new Response(
          JSON.stringify({
            ok: true,
            access_token: 'xoxp_user',
            scope: 'chat:write',
            team_id: 'T_FALLBACK',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    });
    const tokens = await c.exchangeCode(ctx(f), 'code');
    expect(tokens.accountId).toBe('T_FALLBACK');
  });

  it('exchangeCode throws when token response missing access_token', async () => {
    const { fetch: f } = makeFetch({
      'https://slack.com/api/oauth.v2.access': () =>
        new Response(JSON.stringify({ ok: true, team: { id: 'T' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    await expect(c.exchangeCode(ctx(f), 'code')).rejects.toBeInstanceOf(ConnectorAuthError);
  });
});

describe('github connector — additional', () => {
  const c = getConnector('github');

  it('callApi GET on a non-JSON 204 returns empty body', async () => {
    const { fetch: f } = makeFetch({
      'https://api.github.com/user/starred/acme/repo': () => new Response(null, { status: 204 }),
    });
    const res = await c.callApi(ctx(f), 'gho', {
      method: 'GET',
      path: '/user/starred/acme/repo',
    });
    expect(res.status).toBe(204);
    expect(res.body).toBe('');
  });

  it('exchangeCode throws when /user has no login or id', async () => {
    const { fetch: f } = makeFetch({
      'https://github.com/login/oauth/access_token': () =>
        new Response(JSON.stringify({ access_token: 'tok', scope: 'repo' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      'https://api.github.com/user': () =>
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    await expect(c.exchangeCode(ctx(f), 'code')).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('refresh throws when /user fails after refresh', async () => {
    const { fetch: f } = makeFetch({
      'https://github.com/login/oauth/access_token': () =>
        new Response(JSON.stringify({ access_token: 'tok', refresh_token: 'rt' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      'https://api.github.com/user': () => new Response('nope', { status: 401 }),
    });
    await expect(c.refresh(ctx(f), 'rt_old')).rejects.toMatchObject({
      status: 401,
    });
  });

  it('exchangeCode rejects when token endpoint omits access_token entirely', async () => {
    const { fetch: f } = makeFetch({
      'https://github.com/login/oauth/access_token': () =>
        new Response(JSON.stringify({ scope: 'repo' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    await expect(c.exchangeCode(ctx(f), 'code')).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('refresh rejects when token endpoint returns "error" body', async () => {
    const { fetch: f } = makeFetch({
      'https://github.com/login/oauth/access_token': () =>
        new Response(JSON.stringify({ error: 'bad_refresh_token' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    await expect(c.refresh(ctx(f), 'rt_old')).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('refresh rejects when token endpoint omits access_token', async () => {
    const { fetch: f } = makeFetch({
      'https://github.com/login/oauth/access_token': () =>
        new Response(JSON.stringify({ token_type: 'bearer' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    await expect(c.refresh(ctx(f), 'rt_old')).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('callApi GET preserves query params + custom headers', async () => {
    const { fetch: f, calls } = makeFetch({
      'https://api.github.com/repos/acme/repo/issues': () =>
        new Response(JSON.stringify([{ number: 1 }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    await c.callApi(ctx(f), 'gho', {
      method: 'GET',
      path: '/repos/acme/repo/issues',
      query: { state: 'open' },
      headers: { 'x-custom': 'yes' },
    });
    expect(calls[0].url).toContain('state=open');
    expect(calls[0].headers['x-custom']).toBe('yes');
  });

  it('callApi parses non-JSON 200 body as text fallback', async () => {
    const { fetch: f } = makeFetch({
      'https://api.github.com/zen': () =>
        new Response('Approachable is better than simple.', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        }),
    });
    const res = await c.callApi(ctx(f), 'gho', { method: 'GET', path: '/zen' });
    expect(res.body).toBe('Approachable is better than simple.');
  });

  it('callApi returns text when content-type lies (says json but body is invalid)', async () => {
    const { fetch: f } = makeFetch({
      'https://api.github.com/repos/x/y': () =>
        new Response('<html>not json</html>', {
          status: 502,
          headers: { 'content-type': 'application/json' },
        }),
    });
    const res = await c.callApi(ctx(f), 'gho', { method: 'GET', path: '/repos/x/y' });
    expect(res.status).toBe(502);
    expect(res.body).toBe('<html>not json</html>');
  });
});

describe('discord connector', () => {
  const c = getConnector('discord');

  it('authUrl includes scope=bot+applications.commands, permissions bitfield, state', () => {
    const url = new URL(c.authUrl(ctx(fetch), { state: 'st1' }));
    expect(url.origin + url.pathname).toBe('https://discord.com/oauth2/authorize');
    expect(url.searchParams.get('client_id')).toBe('CLIENT_ID');
    expect(url.searchParams.get('scope')).toBe('bot applications.commands');
    expect(url.searchParams.get('permissions')).toBe('1644971949559');
    expect(url.searchParams.get('state')).toBe('st1');
    expect(url.searchParams.get('response_type')).toBe('code');
  });

  it('exchangeCode parses guild.id as accountId and overrides accessToken with bot token from env', async () => {
    const prev = process.env.OAUTH_DISCORD_BOT_TOKEN;
    process.env.OAUTH_DISCORD_BOT_TOKEN = 'BOT_TOKEN_XYZ';
    try {
      const { fetch: f } = makeFetch({
        'https://discord.com/api/oauth2/token': () =>
          new Response(
            JSON.stringify({
              access_token: 'discord_user_token',
              refresh_token: 'rt',
              expires_in: 604800,
              scope: 'bot applications.commands',
              guild: { id: 'G123456', name: 'Test Guild' },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      });
      const tokens = await c.exchangeCode(ctx(f), 'code1');
      expect(tokens.accountId).toBe('G123456');
      expect(tokens.accessToken).toBe('BOT_TOKEN_XYZ');
      expect(tokens.refreshToken).toBe('');
      expect(tokens.scopesGranted).toEqual(['applications.commands', 'bot']);
    } finally {
      process.env.OAUTH_DISCORD_BOT_TOKEN = prev;
    }
  });

  it('exchangeCode throws ConnectorAuthError when guild missing', async () => {
    process.env.OAUTH_DISCORD_BOT_TOKEN = 'BOT_TOKEN_XYZ';
    const { fetch: f } = makeFetch({
      'https://discord.com/api/oauth2/token': () =>
        new Response(JSON.stringify({ access_token: 'x', scope: 'bot' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    await expect(c.exchangeCode(ctx(f), 'bad')).rejects.toMatchObject({
      message: /missing guild\.id/,
    });
  });

  it('exchangeCode throws when bot token env var unset', async () => {
    const prev = process.env.OAUTH_DISCORD_BOT_TOKEN;
    delete process.env.OAUTH_DISCORD_BOT_TOKEN;
    try {
      const { fetch: f } = makeFetch({
        'https://discord.com/api/oauth2/token': () =>
          new Response(
            JSON.stringify({
              access_token: 'x',
              scope: 'bot',
              guild: { id: 'G1' },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      });
      await expect(c.exchangeCode(ctx(f), 'code')).rejects.toMatchObject({
        message: /OAUTH_DISCORD_BOT_TOKEN/,
      });
    } finally {
      process.env.OAUTH_DISCORD_BOT_TOKEN = prev;
    }
  });

  it('refresh always throws (bot installs do not issue refresh tokens)', async () => {
    await expect(c.refresh(ctx(fetch), 'anything')).rejects.toMatchObject({
      message: /do not issue refresh tokens/,
    });
  });

  it('callApi sends Authorization: Bot <token> and JSON body on POST', async () => {
    const { fetch: f, calls } = makeFetch({
      'https://discord.com/api/v10/guilds/G1/channels': () =>
        new Response(JSON.stringify({ id: 'C1', name: 'general' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
    });
    const res = await c.callApi(ctx(f), 'BOT_TOK', {
      method: 'POST',
      path: '/guilds/G1/channels',
      body: { name: 'general', type: 0 },
    });
    expect(res.status).toBe(201);
    expect(calls[0].headers.authorization).toBe('Bot BOT_TOK');
    expect(calls[0].headers['content-type']).toBe('application/json; charset=utf-8');
    expect(calls[0].body).toBe('{"name":"general","type":0}');
  });

  it('callApi omits body on DELETE', async () => {
    const { fetch: f, calls } = makeFetch({
      'https://discord.com/api/v10/channels/C1': () => new Response(null, { status: 204 }),
    });
    const res = await c.callApi(ctx(f), 'BOT_TOK', {
      method: 'DELETE',
      path: '/channels/C1',
    });
    expect(res.status).toBe(204);
    expect(calls[0].body).toBeUndefined();
  });
});
