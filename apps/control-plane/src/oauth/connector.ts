/**
 * OAuth connector framework — Sprint 5 (the wedge).
 *
 * Each upstream SaaS provider (GitHub, Slack, Google, Notion, …) implements
 * the same `Connector` interface so the rest of the platform can ignore
 * provider-specific OAuth quirks. Connectors are stateless and pure: they
 * take a `ConnectorContext` (client credentials + an injectable fetch) plus
 * data, and return data. All persistence + encryption happens in
 * `oauth/tokens.ts`; all routing happens in `routes/oauth.ts`.
 *
 * The shape mirrors the four operations the rest of the platform actually
 * needs:
 *   - `authUrl()` — build the redirect URL the dashboard sends the user to.
 *   - `exchangeCode()` — turn an authorization-code callback into tokens.
 *   - `refresh()` — turn a stored refresh token into a fresh access token
 *     (D-1 — Sprint 5.6 wires this into the proxy adapter).
 *   - `callApi()` — make an authenticated request against the upstream API
 *     so the PDP-side proxy adapter (Sprint 5.5) can issue calls without
 *     duplicating per-provider HTTP wiring.
 */

/**
 * All connector ids known to the data model. The pgEnum lists every connector
 * the platform expects to ship eventually (Sprint 10 adds the remaining six);
 * Sprint 5 only registers handlers for the first four. `connectorRegistry`
 * (oauth/connectors/index.ts) is the source of truth for which ids are
 * actually wired today — `getConnector(id)` throws when called with an id
 * for which no implementation exists yet.
 */
export type ConnectorId =
  | 'github'
  | 'slack'
  | 'google'
  | 'notion'
  | 'salesforce'
  | 'linear'
  | 'stripe'
  | 'jira'
  | 'google_calendar'
  | 'postgres'
  // M3 — YAML-driven adapters. Manual-token path works for all of these
  // today; OAuth executor coverage is per-connector and rolls out across P1.
  | 'google_gmail'
  | 'google_drive'
  | 'google_contacts'
  | 'discord'
  | 'telegram'
  | 'dropbox'
  | 'twilio'
  | 'granola'
  | 'perplexity'
  | 'imessage';

export type ImplementedConnectorId =
  | 'github'
  | 'slack'
  | 'google'
  | 'notion'
  | 'linear'
  | 'stripe'
  | 'discord';

export interface OAuthTokens {
  accessToken: string;
  /**
   * Refresh token. Some providers (Slack v2 user tokens, Notion) do not issue
   * one — connectors return an empty string in that case and the platform
   * treats the connection as non-refreshable (re-auth required).
   */
  refreshToken: string;
  /** ISO timestamp; null when provider does not return access-token expiry. */
  accessTokenExpiresAt: Date | null;
  /** ISO timestamp; null when provider's refresh tokens are non-expiring. */
  refreshTokenExpiresAt: Date | null;
  scopesGranted: string[];
  /** Provider's stable account identifier (e.g. GitHub login, Slack team_id). */
  accountId: string;
}

export interface ConnectorContext {
  /** Injectable fetch — tests can pass a mock here. Defaults to global fetch. */
  fetch: typeof fetch;
  clientId: string;
  clientSecret: string;
  /** Absolute https URL the provider will redirect to after consent. */
  redirectUri: string;
}

export interface ApiCallRequest {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  /** Extra request headers (rare — most calls only need bearer + content-type). */
  headers?: Record<string, string>;
}

export interface ApiCallResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

export interface Connector {
  id: ImplementedConnectorId;
  /** Default scope list requested at consent time. */
  defaultScopes: string[];
  /** Build the authorize URL the dashboard sends the user to. */
  authUrl(ctx: ConnectorContext, opts: { state: string; scopes?: string[] }): string;
  /** Exchange an authorization code for tokens. */
  exchangeCode(ctx: ConnectorContext, code: string): Promise<OAuthTokens>;
  /**
   * Refresh tokens using a previously-issued refresh token. Throws when the
   * provider rejects the refresh (e.g. user revoked, or the refresh token has
   * itself expired) so the caller can deny + mark the connection invalid.
   */
  refresh(ctx: ConnectorContext, refreshToken: string): Promise<OAuthTokens>;
  /**
   * Make an authenticated request against the upstream API. Returns the raw
   * status + parsed body so callers (proxy adapter, sweep job) can decide
   * how to react to non-2xx responses.
   */
  callApi(
    ctx: ConnectorContext,
    accessToken: string,
    req: ApiCallRequest,
  ): Promise<ApiCallResponse>;
}

export class ConnectorAuthError extends Error {
  readonly status: number;
  readonly providerBody: unknown;
  constructor(message: string, status: number, providerBody: unknown) {
    super(message);
    this.name = 'ConnectorAuthError';
    this.status = status;
    this.providerBody = providerBody;
  }
}

/**
 * Shared helper: make a `application/x-www-form-urlencoded` token-endpoint
 * request and parse the JSON response. Handles both standard OAuth2 token
 * payloads (`access_token`/`refresh_token`/`expires_in`) and per-provider
 * shape munging (Slack v2, Notion) via the `extract` callback.
 */
export async function postFormToTokenEndpoint(
  ctx: ConnectorContext,
  url: string,
  params: Record<string, string>,
  opts: {
    /** When true, send `Authorization: Basic base64(client_id:client_secret)`. */
    basicAuth?: boolean;
    /** Extra static headers (e.g. `Notion-Version`). */
    headers?: Record<string, string>;
  } = {},
): Promise<unknown> {
  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
    accept: 'application/json',
    ...(opts.headers ?? {}),
  };
  const body = new URLSearchParams(params).toString();
  if (opts.basicAuth) {
    const creds = Buffer.from(`${ctx.clientId}:${ctx.clientSecret}`).toString('base64');
    headers.authorization = `Basic ${creds}`;
  }
  const res = await ctx.fetch(url, { method: 'POST', headers, body });
  const raw = await res.text();
  let parsed: unknown;
  try {
    parsed = raw.length > 0 ? JSON.parse(raw) : {};
  } catch {
    throw new ConnectorAuthError(
      `token endpoint returned non-JSON: ${raw.slice(0, 200)}`,
      res.status,
      raw,
    );
  }
  if (!res.ok) {
    throw new ConnectorAuthError(`token endpoint returned HTTP ${res.status}`, res.status, parsed);
  }
  return parsed;
}

/** Normalize an `expires_in` (seconds) field into a Date, with null fallback. */
export function expiresInToDate(expiresIn: unknown, now: Date = new Date()): Date | null {
  if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    return null;
  }
  return new Date(now.getTime() + expiresIn * 1000);
}

/** Parse an OAuth scope string ("repo read:user") into a sorted, de-duped array. */
export function parseScopeString(s: unknown): string[] {
  if (typeof s !== 'string') return [];
  const set = new Set<string>();
  for (const part of s.split(/[\s,]+/)) {
    if (part.length > 0) set.add(part);
  }
  return [...set].sort();
}
