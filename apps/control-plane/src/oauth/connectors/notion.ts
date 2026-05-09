/**
 * Notion OAuth connector.
 *
 * Notion uses HTTP Basic auth on the token endpoint and does not issue
 * refresh tokens — access tokens are long-lived. `refresh()` therefore
 * always throws; callers must re-auth when a token is revoked.
 *
 * API base: https://api.notion.com/v1 — requires `Notion-Version` header.
 */
import {
  type ApiCallRequest,
  type ApiCallResponse,
  type Connector,
  ConnectorAuthError,
  type ConnectorContext,
  type OAuthTokens,
  postFormToTokenEndpoint,
} from '../connector.js';

const AUTHORIZE_URL = 'https://api.notion.com/v1/oauth/authorize';
const TOKEN_URL = 'https://api.notion.com/v1/oauth/token';
const API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

const DEFAULT_SCOPES: string[] = [];

function tokensFromResponse(parsed: unknown): OAuthTokens {
  if (!parsed || typeof parsed !== 'object') {
    throw new ConnectorAuthError('notion token response was not an object', 200, parsed);
  }
  const r = parsed as Record<string, unknown>;
  if (typeof r.access_token !== 'string') {
    throw new ConnectorAuthError('notion token response missing access_token', 200, parsed);
  }
  const accountId =
    typeof r.workspace_id === 'string'
      ? r.workspace_id
      : typeof r.bot_id === 'string'
        ? r.bot_id
        : 'unknown';
  return {
    accessToken: r.access_token,
    refreshToken: '',
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
    scopesGranted: [],
    accountId,
  };
}

export const notionConnector: Connector = {
  id: 'notion',
  defaultScopes: DEFAULT_SCOPES,

  authUrl(ctx, { state }) {
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set('client_id', ctx.clientId);
    url.searchParams.set('redirect_uri', ctx.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('owner', 'user');
    url.searchParams.set('state', state);
    return url.toString();
  },

  async exchangeCode(ctx, code) {
    const parsed = await postFormToTokenEndpoint(
      ctx,
      TOKEN_URL,
      {
        grant_type: 'authorization_code',
        code,
        redirect_uri: ctx.redirectUri,
      },
      { basicAuth: true, headers: { 'notion-version': NOTION_VERSION } },
    );
    return tokensFromResponse(parsed);
  },

  async refresh(_ctx, _refreshToken) {
    throw new ConnectorAuthError(
      'notion does not issue refresh tokens — re-authentication required',
      401,
      null,
    );
  },

  async callApi(ctx, accessToken, req) {
    return callNotionApi(ctx, accessToken, req);
  },
};

async function callNotionApi(
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
    'notion-version': NOTION_VERSION,
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
  try {
    parsed = text.length > 0 ? JSON.parse(text) : {};
  } catch {
    parsed = text;
  }
  const headerObj: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    headerObj[k] = v;
  });
  return { status: res.status, body: parsed, headers: headerObj };
}

export const __test = { tokensFromResponse };
