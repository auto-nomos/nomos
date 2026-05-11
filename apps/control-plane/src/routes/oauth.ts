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
import { eq } from 'drizzle-orm';
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
    const membership = await deps.db.drizzle.query.memberships.findFirst({
      where: eq(schema.memberships.userId, session.user.id),
    });
    if (!membership) {
      return c.json({ error: 'no_customer_membership' }, 403);
    }
    const creds = connectorCredentials(deps.config, id);
    if (!creds) {
      return c.json({ error: 'connector_not_configured', connector: id }, 503);
    }
    const connector = getConnector(id) as Connector;
    const now = deps.now ? deps.now() : Date.now();
    const state = signState(deps.config.OAUTH_STATE_SIGN_SECRET, {
      customerId: membership.customerId,
      connector: id,
      nonce: freshNonce(),
      exp: now + STATE_TTL_MS,
    });
    const authUrl = connector.authUrl(ctxFor(deps, id, creds), { state });
    return c.json({ authUrl, state, expiresAt: new Date(now + STATE_TTL_MS).toISOString() });
  });

  app.get('/v1/oauth/callback/:connector', async (c) => {
    const id = c.req.param('connector');
    if (!isImplementedConnector(id)) {
      return c.json({ error: 'unknown_connector', connector: id }, 404);
    }
    const code = c.req.query('code');
    const state = c.req.query('state');
    if (!code || !state) {
      return c.json({ error: 'missing_code_or_state' }, 400);
    }
    const verification = verifyState(
      deps.config.OAUTH_STATE_SIGN_SECRET,
      state,
      deps.now ? deps.now() : Date.now(),
    );
    if (!verification.ok || !verification.payload) {
      return c.json({ error: 'invalid_state', reason: verification.reason }, 400);
    }
    if (verification.payload.connector !== id) {
      return c.json({ error: 'state_connector_mismatch' }, 400);
    }
    const creds = connectorCredentials(deps.config, id);
    if (!creds) {
      return c.json({ error: 'connector_not_configured', connector: id }, 503);
    }
    const connector = getConnector(id) as Connector;
    const ctx = ctxFor(deps, id, creds);
    let tokens: Awaited<ReturnType<Connector['exchangeCode']>>;
    try {
      tokens = await connector.exchangeCode(ctx, code);
    } catch (err) {
      const status = err instanceof ConnectorAuthError ? 400 : 502;
      deps.logger.warn({ err, connector: id }, 'oauth code exchange failed');
      return c.json(
        {
          error: 'code_exchange_failed',
          connector: id,
          providerStatus: err instanceof ConnectorAuthError ? err.status : null,
        },
        status,
      );
    }
    const stored = await saveConnection(
      { db: deps.db.drizzle, encryptionKey: deps.encryptionKey },
      {
        customerId: verification.payload.customerId,
        connector: id,
        tokens,
      },
    );
    return c.json({
      connectionId: stored.id,
      connector: id,
      accountId: stored.accountId,
      scopesGranted: stored.tokens.scopesGranted,
    });
  });

  return app;
}
