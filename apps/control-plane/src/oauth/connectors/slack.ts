/**
 * Slack OAuth v2 connector.
 *
 * Slack's `oauth.v2.access` endpoint returns an envelope shape that differs
 * from the OAuth2 RFC — `{ ok: true, access_token, refresh_token?, expires_in?,
 * scope, team: { id }, authed_user: { id } }` for bot-token flows. We treat
 * `team.id` as the account id (Slack workspace).
 *
 * Refresh tokens only exist on token-rotation-enabled apps; otherwise refresh
 * throws and the caller surfaces `oauth_token_invalid`.
 *
 * API base: https://slack.com/api — bearer auth.
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

const AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';
const TOKEN_URL = 'https://slack.com/api/oauth.v2.access';
const API_BASE = 'https://slack.com/api';

const DEFAULT_SCOPES = ['chat:write', 'channels:read', 'users:read'];

function tokensFromV2(parsed: unknown): OAuthTokens {
  if (!parsed || typeof parsed !== 'object') {
    throw new ConnectorAuthError('slack token response was not an object', 200, parsed);
  }
  const r = parsed as Record<string, unknown>;
  if (r.ok !== true) {
    throw new ConnectorAuthError(
      `slack token response not ok: ${typeof r.error === 'string' ? r.error : 'unknown'}`,
      200,
      parsed,
    );
  }
  if (typeof r.access_token !== 'string') {
    throw new ConnectorAuthError('slack token response missing access_token', 200, parsed);
  }
  const team = (r.team as Record<string, unknown> | undefined) ?? {};
  const accountId =
    typeof team.id === 'string' ? team.id : typeof r.team_id === 'string' ? r.team_id : 'unknown';
  return {
    accessToken: r.access_token,
    refreshToken: typeof r.refresh_token === 'string' ? r.refresh_token : '',
    accessTokenExpiresAt: expiresInToDate(r.expires_in),
    refreshTokenExpiresAt: null,
    scopesGranted: parseScopeString(r.scope),
    accountId,
  };
}

export const slackConnector: Connector = {
  id: 'slack',
  defaultScopes: DEFAULT_SCOPES,

  authUrl(ctx, { state, scopes = DEFAULT_SCOPES }) {
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set('client_id', ctx.clientId);
    url.searchParams.set('redirect_uri', ctx.redirectUri);
    url.searchParams.set('scope', scopes.join(','));
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
    return tokensFromV2(parsed);
  },

  async refresh(ctx, refreshToken) {
    if (refreshToken === '') {
      throw new ConnectorAuthError(
        'slack connection has no refresh token (token rotation not enabled) — re-authentication required',
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
    return tokensFromV2(parsed);
  },

  async callApi(ctx, accessToken, req) {
    return callSlackApi(ctx, accessToken, req);
  },
};

async function callSlackApi(
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
    headers['content-type'] = 'application/json; charset=utf-8';
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

export const __test = { tokensFromV2 };
