/**
 * Google OAuth 2.0 connector.
 *
 * Google issues refresh tokens only when `access_type=offline` and
 * `prompt=consent` are set on the authorize URL — without these, refresh
 * fails after the first hour and the user needs to re-consent. The defaults
 * here include both.
 *
 * The connector pins the API base to `https://www.googleapis.com`. Service
 * routing (Drive, Calendar, Gmail) lives in the schema packs (Sprint 10) so
 * Sprint 5 only needs a generic call surface.
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

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_BASE = 'https://www.googleapis.com';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

const DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/drive.readonly',
];

function tokensFromResponse(parsed: unknown, accountId: string): OAuthTokens {
  if (!parsed || typeof parsed !== 'object') {
    throw new ConnectorAuthError('google token response was not an object', 200, parsed);
  }
  const r = parsed as Record<string, unknown>;
  if (typeof r.access_token !== 'string') {
    throw new ConnectorAuthError('google token response missing access_token', 200, parsed);
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
  const res = await ctx.fetch(USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new ConnectorAuthError(
      `google userinfo returned HTTP ${res.status}`,
      res.status,
      await res.text().catch(() => ''),
    );
  }
  const body = (await res.json()) as { sub?: unknown; email?: unknown };
  if (typeof body.sub === 'string') return body.sub;
  if (typeof body.email === 'string') return body.email;
  throw new ConnectorAuthError('google userinfo missing sub/email', 200, body);
}

export const googleConnector: Connector = {
  id: 'google',
  defaultScopes: DEFAULT_SCOPES,

  authUrl(ctx, { state, scopes = DEFAULT_SCOPES }) {
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set('client_id', ctx.clientId);
    url.searchParams.set('redirect_uri', ctx.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', scopes.join(' '));
    url.searchParams.set('state', state);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    return url.toString();
  },

  async exchangeCode(ctx, code) {
    const parsed = await postFormToTokenEndpoint(ctx, TOKEN_URL, {
      client_id: ctx.clientId,
      client_secret: ctx.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: ctx.redirectUri,
    });
    const r = parsed as Record<string, unknown>;
    const accessToken = typeof r.access_token === 'string' ? r.access_token : '';
    if (accessToken === '') {
      throw new ConnectorAuthError('google token endpoint missing access_token', 200, parsed);
    }
    const accountId = await fetchAccountId(ctx, accessToken);
    return tokensFromResponse(parsed, accountId);
  },

  async refresh(ctx, refreshToken) {
    if (refreshToken === '') {
      throw new ConnectorAuthError(
        'google connection has no refresh token — re-consent with access_type=offline required',
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
      throw new ConnectorAuthError('google refresh missing access_token', 401, parsed);
    }
    // Google does not always re-emit the refresh_token on refresh; preserve
    // the original so the caller can re-persist without overwriting with ''.
    const result = tokensFromResponse(parsed, await fetchAccountId(ctx, accessToken));
    if (result.refreshToken === '') result.refreshToken = refreshToken;
    return result;
  },

  async callApi(ctx, accessToken, req) {
    return callGoogleApi(ctx, accessToken, req);
  },
};

async function callGoogleApi(
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

export const __test = { tokensFromResponse, fetchAccountId };
