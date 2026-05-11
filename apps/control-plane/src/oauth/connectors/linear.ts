/**
 * Linear OAuth connector (P-CV3 — Clawvisor parity catch-up).
 *
 * Linear uses standard OAuth 2.0 with refresh tokens. The API is GraphQL
 * at `https://api.linear.app/graphql`; non-GraphQL paths (e.g. /viewer)
 * do not exist, so we use a single GraphQL POST for the account-id
 * lookup and proxy any caller-supplied `path` against the GraphQL
 * endpoint as well — `path` is treated as the relative endpoint
 * (typically '/graphql') and `body` carries the GraphQL query.
 *
 * Scopes: `read` (GraphQL queries), `write` (mutations), `issues:create`
 * (narrow create-only). Default = `read,issues:create` — least
 * privilege; templates can request `write` explicitly.
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

const AUTHORIZE_URL = 'https://linear.app/oauth/authorize';
const TOKEN_URL = 'https://api.linear.app/oauth/token';
const API_BASE = 'https://api.linear.app';
const GRAPHQL_PATH = '/graphql';

const DEFAULT_SCOPES = ['read', 'issues:create'];

function tokensFromResponse(parsed: unknown, accountId: string): OAuthTokens {
  if (!parsed || typeof parsed !== 'object') {
    throw new ConnectorAuthError('linear token response was not an object', 200, parsed);
  }
  const r = parsed as Record<string, unknown>;
  if (typeof r.access_token !== 'string') {
    throw new ConnectorAuthError('linear token response missing access_token', 200, parsed);
  }
  return {
    accessToken: r.access_token,
    refreshToken: typeof r.refresh_token === 'string' ? r.refresh_token : '',
    accessTokenExpiresAt: expiresInToDate(r.expires_in),
    refreshTokenExpiresAt: null,
    scopesGranted: parseScopeString(r.scope),
    accountId,
  };
}

async function fetchAccountId(ctx: ConnectorContext, accessToken: string): Promise<string> {
  const res = await ctx.fetch(`${API_BASE}${GRAPHQL_PATH}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ query: '{ viewer { id name email } }' }),
  });
  if (!res.ok) {
    throw new ConnectorAuthError(
      `linear viewer query returned HTTP ${res.status}`,
      res.status,
      await res.text().catch(() => ''),
    );
  }
  const body = (await res.json()) as {
    data?: { viewer?: { id?: unknown; email?: unknown } };
  };
  const viewer = body.data?.viewer;
  if (viewer && typeof viewer.id === 'string') return viewer.id;
  if (viewer && typeof viewer.email === 'string') return viewer.email;
  throw new ConnectorAuthError('linear viewer query returned no id/email', 200, body);
}

export const linearConnector: Connector = {
  id: 'linear',
  defaultScopes: DEFAULT_SCOPES,

  authUrl(ctx, { state, scopes = DEFAULT_SCOPES }) {
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set('client_id', ctx.clientId);
    url.searchParams.set('redirect_uri', ctx.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', scopes.join(','));
    url.searchParams.set('state', state);
    url.searchParams.set('prompt', 'consent');
    return url.toString();
  },

  async exchangeCode(ctx, code) {
    const parsed = await postFormToTokenEndpoint(ctx, TOKEN_URL, {
      client_id: ctx.clientId,
      client_secret: ctx.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: ctx.redirectUri,
    });
    const r = parsed as Record<string, unknown>;
    const accessToken = typeof r.access_token === 'string' ? r.access_token : '';
    if (accessToken === '') {
      throw new ConnectorAuthError('linear token endpoint missing access_token', 200, parsed);
    }
    const accountId = await fetchAccountId(ctx, accessToken);
    return tokensFromResponse(parsed, accountId);
  },

  async refresh(ctx, refreshToken) {
    if (refreshToken === '') {
      throw new ConnectorAuthError(
        'linear connection has no refresh token — re-authentication required',
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
    const r = parsed as Record<string, unknown>;
    const accessToken = typeof r.access_token === 'string' ? r.access_token : '';
    if (accessToken === '') {
      throw new ConnectorAuthError('linear refresh missing access_token', 401, parsed);
    }
    const accountId = await fetchAccountId(ctx, accessToken);
    return tokensFromResponse(parsed, accountId);
  },

  async callApi(ctx, accessToken, req) {
    return callLinearApi(ctx, accessToken, req);
  },
};

async function callLinearApi(
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
    accept: 'application/json',
    ...(req.headers ?? {}),
  };
  let body: string | undefined;
  if (req.body !== undefined && req.method !== 'GET') {
    body = JSON.stringify(req.body);
    headers['content-type'] = 'application/json';
  }
  const res = await ctx.fetch(url.toString(), { method: req.method, headers, body });
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
