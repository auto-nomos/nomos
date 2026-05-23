/**
 * Discord bot-install OAuth connector.
 *
 * Discord's bot OAuth flow is two-stage:
 *
 *   1. User visits `discord.com/oauth2/authorize?scope=bot+applications.commands
 *      &permissions=<bitfield>&client_id=<app>&redirect_uri=<cb>&state=...`,
 *      picks the guild they want to install the bot into, clicks Authorize.
 *   2. Discord redirects to the callback with `?code=...&guild_id=<id>` and
 *      we exchange the code for a token response that includes `guild: {id,name,...}`.
 *
 * The OAuth response gives us a short-lived USER access_token tied to the
 * installing user — that token cannot drive bot API calls (channel create,
 * role create, etc). Bot API calls require the static **bot token** from the
 * Discord Developer Portal ("Bot" tab), exposed to the control-plane via
 * `OAUTH_DISCORD_BOT_TOKEN`. We store that bot token as the connection's
 * `accessToken`, the OAuth flow only being used to: (a) prove the operator
 * authorized the install, (b) capture which guild the bot was installed into
 * (persisted as `accountId` so per-connection guild scoping works).
 *
 * Bot tokens do not expire and Discord does not issue refresh tokens for the
 * bot install path — `refresh()` always throws.
 *
 * API base: https://discord.com/api/v10 — `Authorization: Bot <token>`.
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

const AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
const TOKEN_URL = 'https://discord.com/api/oauth2/token';
const API_BASE = 'https://discord.com/api/v10';

const DEFAULT_SCOPES = ['bot', 'applications.commands'];

/**
 * Default permission bitfield for the install link. Includes: Manage Channels
 * (16), Manage Roles (268435456), View Channels (1024), Send Messages (2048),
 * Manage Messages (8192), Create Invite (1), Manage Webhooks (536870912),
 * Manage Emojis and Stickers (1073741824), Read Message History (65536),
 * Add Reactions (64). Combined = 1644971949559.
 */
const DEFAULT_PERMISSIONS = '1644971949559';

interface DiscordTokenEnvelope {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  scope?: unknown;
  guild?: { id?: unknown; name?: unknown } | unknown;
}

function readBotTokenFromEnv(): string {
  const t = process.env.OAUTH_DISCORD_BOT_TOKEN;
  if (typeof t === 'string' && t.length > 0) return t;
  throw new ConnectorAuthError(
    'OAUTH_DISCORD_BOT_TOKEN is not configured — set the bot token from the Discord Developer Portal',
    503,
    null,
  );
}

function tokensFromResponse(parsed: unknown): OAuthTokens {
  if (!parsed || typeof parsed !== 'object') {
    throw new ConnectorAuthError('discord token response was not an object', 200, parsed);
  }
  const r = parsed as DiscordTokenEnvelope;
  if (typeof r.access_token !== 'string') {
    throw new ConnectorAuthError('discord token response missing access_token', 200, parsed);
  }
  const guild =
    r.guild && typeof r.guild === 'object' ? (r.guild as Record<string, unknown>) : null;
  const guildId = guild && typeof guild.id === 'string' ? guild.id : null;
  if (!guildId) {
    throw new ConnectorAuthError(
      'discord token response missing guild.id — bot install must target a guild',
      200,
      parsed,
    );
  }
  // The bot token (static) is the credential we actually use to call the
  // Discord API. The user access_token from the OAuth response is discarded.
  const botToken = readBotTokenFromEnv();
  return {
    accessToken: botToken,
    // Bot tokens don't expire and the bot-install flow doesn't issue a
    // matching refresh token. Sweep treats empty refreshToken as
    // "non-refreshable"; refresh() throws below.
    refreshToken: '',
    accessTokenExpiresAt: expiresInToDate(r.expires_in),
    refreshTokenExpiresAt: null,
    scopesGranted: parseScopeString(r.scope),
    accountId: guildId,
  };
}

export const discordConnector: Connector = {
  id: 'discord',
  defaultScopes: DEFAULT_SCOPES,

  authUrl(ctx, { state, scopes = DEFAULT_SCOPES }) {
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set('client_id', ctx.clientId);
    url.searchParams.set('redirect_uri', ctx.redirectUri);
    url.searchParams.set('response_type', 'code');
    // Discord uses space-separated scopes.
    url.searchParams.set('scope', scopes.join(' '));
    url.searchParams.set('permissions', DEFAULT_PERMISSIONS);
    url.searchParams.set('state', state);
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
    return tokensFromResponse(parsed);
  },

  async refresh(_ctx, _refreshToken) {
    throw new ConnectorAuthError(
      'discord bot installs do not issue refresh tokens — re-authorize the bot install if the connection is invalid',
      401,
      null,
    );
  },

  async callApi(ctx, accessToken, req) {
    return callDiscordApi(ctx, accessToken, req);
  },
};

async function callDiscordApi(
  ctx: ConnectorContext,
  accessToken: string,
  req: ApiCallRequest,
): Promise<ApiCallResponse> {
  const url = new URL(`${API_BASE}${req.path}`);
  if (req.query) {
    for (const [k, v] of Object.entries(req.query)) url.searchParams.set(k, v);
  }
  const headers: Record<string, string> = {
    // Discord uses `Bot <token>`, not `Bearer <token>`.
    authorization: `Bot ${accessToken}`,
    accept: 'application/json',
    'user-agent': 'NomosBroker (https://auto-nomos.com, 1.0)',
    ...(req.headers ?? {}),
  };
  let body: string | undefined;
  if (req.body !== undefined && req.method !== 'GET' && req.method !== 'DELETE') {
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

export const __test = { tokensFromResponse, DEFAULT_PERMISSIONS };
