/**
 * Stripe Connect OAuth connector (P-CV3 — Clawvisor parity catch-up).
 *
 * Stripe Connect (Standard accounts) returns a long-lived access token +
 * stripe_user_id during code exchange. There is no refresh token —
 * `refresh()` always throws. The default schema-pack templates exclude
 * the highest-blast-radius actions (refund, send-invoice) — operators
 * who need them must explicitly enable a write template.
 *
 * API base: https://api.stripe.com/v1 — bearer auth via the platform
 * secret key on behalf of the connected account when proxying.
 */
import {
  type ApiCallRequest,
  type ApiCallResponse,
  type Connector,
  ConnectorAuthError,
  type ConnectorContext,
  type OAuthTokens,
  parseScopeString,
  postFormToTokenEndpoint,
} from '../connector.js';

const AUTHORIZE_URL = 'https://connect.stripe.com/oauth/authorize';
const TOKEN_URL = 'https://connect.stripe.com/oauth/token';
const API_BASE = 'https://api.stripe.com';

const DEFAULT_SCOPES = ['read_only'];

function tokensFromResponse(parsed: unknown): OAuthTokens {
  if (!parsed || typeof parsed !== 'object') {
    throw new ConnectorAuthError('stripe token response was not an object', 200, parsed);
  }
  const r = parsed as Record<string, unknown>;
  if (typeof r.access_token !== 'string') {
    throw new ConnectorAuthError('stripe token response missing access_token', 200, parsed);
  }
  const accountId = typeof r.stripe_user_id === 'string' ? r.stripe_user_id : 'unknown';
  return {
    accessToken: r.access_token,
    // Stripe Connect Standard returns no refresh token. Sweep treats
    // empty refreshToken as "non-refreshable" and surfaces oauth_token_invalid
    // when the access token is rejected upstream.
    refreshToken: '',
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
    scopesGranted: parseScopeString(r.scope),
    accountId,
  };
}

export const stripeConnector: Connector = {
  id: 'stripe',
  defaultScopes: DEFAULT_SCOPES,

  authUrl(ctx, { state, scopes = DEFAULT_SCOPES }) {
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set('client_id', ctx.clientId);
    url.searchParams.set('redirect_uri', ctx.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', scopes.join(' '));
    url.searchParams.set('state', state);
    return url.toString();
  },

  async exchangeCode(ctx, code) {
    const parsed = await postFormToTokenEndpoint(ctx, TOKEN_URL, {
      client_secret: ctx.clientSecret,
      grant_type: 'authorization_code',
      code,
    });
    return tokensFromResponse(parsed);
  },

  async refresh(_ctx, _refreshToken) {
    throw new ConnectorAuthError(
      'stripe Connect does not issue refresh tokens — re-authentication required',
      401,
      null,
    );
  },

  async callApi(ctx, accessToken, req) {
    return callStripeApi(ctx, accessToken, req);
  },
};

async function callStripeApi(
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
  // Stripe expects application/x-www-form-urlencoded for POST/PATCH/PUT.
  let body: string | undefined;
  if (req.body !== undefined && req.method !== 'GET' && req.method !== 'DELETE') {
    body = encodeStripeForm(req.body);
    headers['content-type'] = 'application/x-www-form-urlencoded';
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

/** Stripe's API uses URL-encoded form bodies with bracket notation for
 *  nested values. For the proxy use-case we accept caller-provided JSON
 *  and flatten one level — anything deeper they can pass as a
 *  pre-serialized string body via a custom header. */
function encodeStripeForm(body: unknown): string {
  if (typeof body === 'string') return body;
  if (!body || typeof body !== 'object') return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'object' && !Array.isArray(v)) {
      for (const [nk, nv] of Object.entries(v as Record<string, unknown>)) {
        if (nv === undefined || nv === null) continue;
        params.append(`${k}[${nk}]`, String(nv));
      }
    } else if (Array.isArray(v)) {
      for (const item of v) params.append(`${k}[]`, String(item));
    } else {
      params.append(k, String(v));
    }
  }
  return params.toString();
}

export const __test = { tokensFromResponse, encodeStripeForm };
