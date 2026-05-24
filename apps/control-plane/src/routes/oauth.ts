/**
 * OAuth init + callback routes.
 *
 *   POST /v1/oauth/connect/:connector   (authed) → returns the upstream
 *     authorize URL the dashboard should redirect the user to.
 *   GET  /v1/oauth/callback/:connector  (public) → provider hits this with
 *     `?code=…&state=…` after consent. Verifies the state, exchanges the
 *     code via the connector, persists the encrypted tokens.
 *
 * Per-provider client_id / client_secret come from env. If a connector is
 * unconfigured (empty client_id), POST /connect returns 503 so the caller
 * can render a "not enabled" message in the dashboard.
 */
import { sha256Hex } from '@auto-nomos/crypto';
import { and, eq, lt } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Auth } from '../auth/index.js';
import type { Config } from '../config.js';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema.js';
import type { Logger } from '../logger.js';
import {
  type Connector,
  ConnectorAuthError,
  type ConnectorContext,
  type ImplementedConnectorId,
} from '../oauth/connector.js';
import { ALL_CONNECTOR_IDS, getConnector } from '../oauth/connectors/index.js';
import { freshNonce, signState, verifyState } from '../oauth/state.js';
import { saveConnection } from '../oauth/tokens.js';

export interface OAuthRoutesDeps {
  db: Db;
  auth: Auth;
  config: Config;
  logger: Logger;
  /** 32-byte master key already loaded by the bootstrap (loadConfig). */
  encryptionKey: Uint8Array;
  /** Injectable fetch for tests. Defaults to globalThis.fetch. */
  fetch?: typeof fetch;
  /** Override clock for state-expiry tests. */
  now?: () => number;
}

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes — long enough for slow consent screens.

function isImplementedConnector(id: string): id is ImplementedConnectorId {
  return (ALL_CONNECTOR_IDS as readonly string[]).includes(id);
}

function connectorCredentials(
  config: Config,
  id: ImplementedConnectorId,
): { clientId: string; clientSecret: string } | null {
  const map: Record<ImplementedConnectorId, [string | undefined, string | undefined]> = {
    github: [config.OAUTH_GITHUB_CLIENT_ID, config.OAUTH_GITHUB_CLIENT_SECRET],
    slack: [config.OAUTH_SLACK_CLIENT_ID, config.OAUTH_SLACK_CLIENT_SECRET],
    google: [config.OAUTH_GOOGLE_CLIENT_ID, config.OAUTH_GOOGLE_CLIENT_SECRET],
    notion: [config.OAUTH_NOTION_CLIENT_ID, config.OAUTH_NOTION_CLIENT_SECRET],
    linear: [config.OAUTH_LINEAR_CLIENT_ID, config.OAUTH_LINEAR_CLIENT_SECRET],
    stripe: [config.OAUTH_STRIPE_CLIENT_ID, config.OAUTH_STRIPE_CLIENT_SECRET],
    discord: [config.OAUTH_DISCORD_CLIENT_ID, config.OAUTH_DISCORD_CLIENT_SECRET],
  };
  const [cid, sec] = map[id];
  if (!cid || !sec) return null;
  return { clientId: cid, clientSecret: sec };
}

function ctxFor(
  deps: OAuthRoutesDeps,
  id: ImplementedConnectorId,
  creds: { clientId: string; clientSecret: string },
): ConnectorContext {
  return {
    fetch: deps.fetch ?? globalThis.fetch,
    clientId: creds.clientId,
    clientSecret: creds.clientSecret,
    redirectUri: `${deps.config.CONTROL_PLANE_PUBLIC_URL.replace(/\/+$/, '')}/v1/oauth/callback/${id}`,
  };
}

/** Build dashboard URL the browser lands on after the OAuth callback. */
function dashboardReturnUrl(
  deps: Pick<OAuthRoutesDeps, 'config'>,
  params: Record<string, string | undefined>,
): string {
  const base = deps.config.DASHBOARD_PUBLIC_URL.replace(/\/+$/, '');
  const url = new URL(`${base}/app/connections`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  return url.toString();
}

export function createOAuthRoutes(deps: OAuthRoutesDeps): Hono {
  const app = new Hono();

  app.post('/v1/oauth/connect/:connector', async (c) => {
    const id = c.req.param('connector');
    if (!isImplementedConnector(id)) {
      return c.json({ error: 'unknown_connector', connector: id }, 404);
    }
    const session = await deps.auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    // Audit H1 (2026-05-24): the membership lookup used to filter on userId
    // only, returning some arbitrary org for multi-org users — OAuth could
    // bind to a tenant the user didn't intend. Prefer the user's
    // activeCustomerId; only fall back to a first owner / first membership
    // if no active org is set (single-org accounts).
    const userRow = await deps.db.drizzle.query.user.findFirst({
      where: eq(schema.user.id, session.user.id),
      columns: { activeCustomerId: true },
    });
    let membership: typeof schema.memberships.$inferSelect | undefined;
    if (userRow?.activeCustomerId) {
      membership = await deps.db.drizzle.query.memberships.findFirst({
        where: and(
          eq(schema.memberships.userId, session.user.id),
          eq(schema.memberships.customerId, userRow.activeCustomerId),
        ),
      });
    }
    if (!membership) {
      const all = await deps.db.drizzle.query.memberships.findMany({
        where: eq(schema.memberships.userId, session.user.id),
      });
      membership = all.find((m) => m.role === 'owner') ?? all[0];
    }
    if (!membership) {
      return c.json({ error: 'no_customer_membership' }, 403);
    }
    const creds = connectorCredentials(deps.config, id);
    if (!creds) {
      return c.json({ error: 'connector_not_configured', connector: id }, 503);
    }
    const connector = getConnector(id) as Connector;
    const now = deps.now ? deps.now() : Date.now();
    const nonce = freshNonce();
    const expiresAt = new Date(now + STATE_TTL_MS);
    // Audit C2 — one-shot ledger entry for this nonce. Stored as sha256
    // so a snapshot of the table never reveals in-flight nonces; the
    // callback hashes the presented nonce the same way before CAS-delete.
    await deps.db.drizzle.insert(schema.oauthStateNonces).values({
      nonceHash: sha256Hex(nonce),
      customerId: membership.customerId,
      connector: id,
      expiresAt,
    });
    const state = signState(deps.config.OAUTH_STATE_SIGN_SECRET, {
      customerId: membership.customerId,
      connector: id,
      nonce,
      exp: now + STATE_TTL_MS,
    });
    const authUrl = connector.authUrl(ctxFor(deps, id, creds), { state });
    return c.json({ authUrl, state, expiresAt: expiresAt.toISOString() });
  });

  app.get('/v1/oauth/callback/:connector', async (c) => {
    // Browser-initiated GET: every branch redirects to the dashboard
    // connections page with `?oauth=success|error&…` so the user sees a
    // friendly banner instead of raw JSON. The machine-readable reason
    // codes ride along as query params for the dashboard to render.
    const id = c.req.param('connector');
    const fail = (reason: string, extra: Record<string, string | undefined> = {}) =>
      c.redirect(
        dashboardReturnUrl(deps, {
          oauth: 'error',
          connector: id,
          reason,
          ...extra,
        }),
        302,
      );
    if (!isImplementedConnector(id)) {
      return fail('unknown_connector');
    }
    const code = c.req.query('code');
    const state = c.req.query('state');
    if (!code || !state) {
      return fail('missing_code_or_state');
    }
    const verification = verifyState(
      deps.config.OAUTH_STATE_SIGN_SECRET,
      state,
      deps.now ? deps.now() : Date.now(),
    );
    if (!verification.ok || !verification.payload) {
      return fail('invalid_state', { detail: verification.reason });
    }
    if (verification.payload.connector !== id) {
      return fail('state_connector_mismatch');
    }
    // Audit C2 — atomic CAS-consume the one-shot nonce. UPDATE-RETURNING
    // semantics via DELETE-RETURNING: only one observer wins, replays of
    // the same captured state see zero rows deleted and are denied with
    // invalid_state regardless of signature validity.
    const nonceHash = sha256Hex(verification.payload.nonce);
    const consumed = await deps.db.drizzle
      .delete(schema.oauthStateNonces)
      .where(eq(schema.oauthStateNonces.nonceHash, nonceHash))
      .returning({ nonceHash: schema.oauthStateNonces.nonceHash });
    if (consumed.length === 0) {
      deps.logger.warn(
        { connector: id, customerId: verification.payload.customerId },
        'oauth callback: nonce already consumed or unknown — replay attempt',
      );
      return fail('invalid_state', { detail: 'nonce_replay_or_unknown' });
    }
    const creds = connectorCredentials(deps.config, id);
    if (!creds) {
      return fail('connector_not_configured');
    }
    const connector = getConnector(id) as Connector;
    const ctx = ctxFor(deps, id, creds);
    let tokens: Awaited<ReturnType<Connector['exchangeCode']>>;
    try {
      tokens = await connector.exchangeCode(ctx, code);
    } catch (err) {
      deps.logger.warn({ err, connector: id }, 'oauth code exchange failed');
      return fail('code_exchange_failed', {
        providerStatus: err instanceof ConnectorAuthError ? String(err.status) : undefined,
      });
    }
    const stored = await saveConnection(
      { db: deps.db.drizzle, encryptionKey: deps.encryptionKey },
      {
        customerId: verification.payload.customerId,
        connector: id,
        tokens,
      },
    );
    return c.redirect(
      dashboardReturnUrl(deps, {
        oauth: 'success',
        connector: id,
        connectionId: stored.id,
        account: stored.accountId,
      }),
      302,
    );
  });

  return app;
}

/**
 * Audit C2 — bounded sweep of expired nonce rows. Caller drives the cadence
 * (typically a setInterval at PDP/CP boot). Idempotent. Returns the number
 * of rows deleted so callers can log + page on unusual growth.
 */
export async function sweepOAuthStateNonces(
  deps: Pick<OAuthRoutesDeps, 'db' | 'now'>,
): Promise<number> {
  const cutoff = new Date(deps.now ? deps.now() : Date.now());
  const deleted = await deps.db.drizzle
    .delete(schema.oauthStateNonces)
    .where(lt(schema.oauthStateNonces.expiresAt, cutoff))
    .returning({ nonceHash: schema.oauthStateNonces.nonceHash });
  return deleted.length;
}
