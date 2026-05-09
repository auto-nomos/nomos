/**
 * GitHub OAuth connector.
 *
 * - GitHub *OAuth Apps* (the dev path for Sprint 5) issue access tokens that
 *   never expire and do not return a refresh token. `refresh()` therefore
 *   throws — the caller (proxy adapter / sweep) is expected to surface
 *   `oauth_token_invalid` and prompt the user to re-auth.
 * - GitHub *Apps* do support refresh tokens; the same connector handles them
 *   — when the token endpoint returns `refresh_token`, refresh() works.
 *
 * API base: https://api.github.com — accepts `Authorization: Bearer <token>`.
 */
import {
  type ApiCallRequest,
  type ApiCallResponse,
  type Connector,
  ConnectorAuthError,
  type ConnectorContext,
  expiresInToDate,
  type OAuthTokens,
  parseScopeString,
  postFormToTokenEndpoint,
} from '../connector.js';

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const API_BASE = 'https://api.github.com';

const DEFAULT_SCOPES = ['repo', 'read:user'];

function tokensFromResponse(parsed: unknown, accountId: string): OAuthTokens {
  if (!parsed || typeof parsed !== 'object') {
    throw new ConnectorAuthError('github token response was not an object', 200, parsed);
  }
  const r = parsed as Record<string, unknown>;
  if (typeof r.access_token !== 'string') {
    throw new ConnectorAuthError(
      `github token response missing access_token: ${JSON.stringify(r).slice(0, 200)}`,
      200,
      parsed,
    );
  }
  return {
    accessToken: r.access_token,
    refreshToken: typeof r.refresh_token === 'string' ? r.refresh_token : '',
    accessTokenExpiresAt: expiresInToDate(r.expires_in),
    refreshTokenExpiresAt: expiresInToDate(r.refresh_token_expires_in),
    scopesGranted: parseScopeString(r.scope),
    accountId,
  };
}

async function fetchAccountId(ctx: ConnectorContext, accessToken: string): Promise<string> {
  const res = await ctx.fetch(`${API_BASE}/user`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'credential-broker',
    },
  });
  if (!res.ok) {
    throw new ConnectorAuthError(
      `github /user returned HTTP ${res.status}`,
      res.status,
      await res.text().catch(() => ''),
    );
  }
  const body = (await res.json()) as { login?: unknown; id?: unknown };
  if (typeof body.login === 'string') return body.login;
  if (typeof body.id === 'number') return String(body.id);
  throw new ConnectorAuthError('github /user returned no login/id', 200, body);
}

export const githubConnector: Connector = {
  id: 'github',
  defaultScopes: DEFAULT_SCOPES,

  authUrl(ctx, { state, scopes = DEFAULT_SCOPES }) {
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set('client_id', ctx.clientId);
    url.searchParams.set('redirect_uri', ctx.redirectUri);
    url.searchParams.set('scope', scopes.join(' '));
    url.searchParams.set('state', state);
    return url.toString();
  },

  async exchangeCode(ctx, code) {
    const parsed = await postFormToTokenEndpoint(ctx, TOKEN_URL, {
      client_id: ctx.clientId,
      client_secret: ctx.clientSecret,
      code,
      redirect_uri: ctx.redirectUri,
    });
    if (parsed && typeof parsed === 'object' && 'error' in parsed) {
      throw new ConnectorAuthError('github token endpoint returned error', 200, parsed);
    }
    const r = parsed as Record<string, unknown>;
    const accessToken = typeof r.access_token === 'string' ? r.access_token : '';
    if (accessToken === '') {
      throw new ConnectorAuthError('github token endpoint missing access_token', 200, parsed);
    }
    const accountId = await fetchAccountId(ctx, accessToken);
    return tokensFromResponse(parsed, accountId);
  },

  async refresh(ctx, refreshToken) {
    if (refreshToken === '') {
      throw new ConnectorAuthError(
        'github connection has no refresh token — re-authentication required',
        401,
        null,
      );
    }
    const parsed = await postFormToTokenEndpoint(ctx, TOKEN_URL, {
      client_id: ctx.clientId,
      client_secret: ctx.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    if (parsed && typeof parsed === 'object' && 'error' in parsed) {
      throw new ConnectorAuthError('github refresh returned error', 401, parsed);
    }
    const r = parsed as Record<string, unknown>;
    const accessToken = typeof r.access_token === 'string' ? r.access_token : '';
    if (accessToken === '') {
      throw new ConnectorAuthError('github refresh missing access_token', 401, parsed);
    }
    const accountId = await fetchAccountId(ctx, accessToken);
    return tokensFromResponse(parsed, accountId);
  },

  async callApi(ctx, accessToken, req) {
    return callGithubApi(ctx, accessToken, req);
  },
};

async function callGithubApi(
  ctx: ConnectorContext,
  accessToken: string,
  req: ApiCallRequest,
): Promise<ApiCallResponse> {
  const url = new URL(`${API_BASE}${req.path}`);
  if (req.query) {
    for (const [k, v] of Object.entries(req.query)) url.searchParams.set(k, v);
  }
  const headers: Record<string, string> = {
    authorization: `Bearer ${accessToken}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'credential-broker',
    ...(req.headers ?? {}),
  };
  let body: string | undefined;
  if (req.body !== undefined && req.method !== 'GET') {
    body = JSON.stringify(req.body);
    headers['content-type'] = 'application/json';
  }
  const res = await ctx.fetch(url.toString(), { method: req.method, headers, body });
  return parseApiResponse(res);
}

async function parseApiResponse(res: Response): Promise<ApiCallResponse> {
  const text = await res.text();
  let parsed: unknown = text;
  if (text.length > 0 && (res.headers.get('content-type') ?? '').includes('json')) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  const headerObj: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    headerObj[k] = v;
  });
  return { status: res.status, body: parsed, headers: headerObj };
}

export const __test = { tokensFromResponse, fetchAccountId };
