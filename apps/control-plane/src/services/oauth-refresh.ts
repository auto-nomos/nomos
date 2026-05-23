/**
 * Refresh a stored OAuth connection by calling the connector's refresh
 * endpoint, then re-persisting the new tokens. Used by:
 *
 *   - The on-demand refresh path (PDP gets 401 from upstream → calls
 *     /v1/internal/oauth-tokens/:id/refresh → retries).
 *   - The background sweep that proactively refreshes connections whose
 *     access tokens expire within 24h.
 *
 * Refresh failure (provider rejects the refresh token, network error, no
 * refresh token configured) throws RefreshError so the caller can deny the
 * request with `oauth_token_invalid`.
 */
import type { Config } from '../config.js';
import type { DrizzleClient } from '../db/index.js';
import {
  type Connector,
  ConnectorAuthError,
  type ConnectorContext,
  type ImplementedConnectorId,
} from '../oauth/connector.js';
import { getConnector } from '../oauth/connectors/index.js';
import {
  loadConnectionById,
  type StoredConnection,
  updateConnectionTokens,
} from '../oauth/tokens.js';

export class RefreshError extends Error {
  readonly code:
    | 'connection_not_found'
    | 'connector_not_implemented'
    | 'connector_unconfigured'
    | 'no_refresh_token'
    | 'provider_rejected'
    | 'transport_error';
  readonly providerStatus?: number;
  constructor(code: RefreshError['code'], message: string, providerStatus?: number) {
    super(message);
    this.code = code;
    this.name = 'RefreshError';
    if (providerStatus !== undefined) this.providerStatus = providerStatus;
  }
}

export interface RefreshDeps {
  db: DrizzleClient;
  encryptionKey: Uint8Array;
  config: Config;
  fetch?: typeof fetch;
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

export async function refreshConnection(
  deps: RefreshDeps,
  customerId: string,
  connectionId: string,
): Promise<StoredConnection> {
  const stored = await loadConnectionById(
    { db: deps.db, encryptionKey: deps.encryptionKey },
    customerId,
    connectionId,
  );
  if (!stored) {
    throw new RefreshError(
      'connection_not_found',
      `oauth connection ${connectionId} not found for customer ${customerId}`,
    );
  }

  const connectorId = stored.connector;
  const isImplemented = (
    [
      'github',
      'slack',
      'google',
      'notion',
      'linear',
      'stripe',
      'discord',
    ] as ImplementedConnectorId[]
  ).includes(connectorId as ImplementedConnectorId);
  if (!isImplemented) {
    throw new RefreshError(
      'connector_not_implemented',
      `connector ${connectorId} has no Sprint-5 implementation`,
    );
  }
  const connector = getConnector(connectorId) as Connector;
  const creds = connectorCredentials(deps.config, connectorId as ImplementedConnectorId);
  if (!creds) {
    throw new RefreshError(
      'connector_unconfigured',
      `connector ${connectorId} has no client_id/secret in env`,
    );
  }
  if (stored.tokens.refreshToken === '') {
    throw new RefreshError(
      'no_refresh_token',
      `connection ${connectionId} has no refresh token — re-auth required`,
    );
  }

  const ctx: ConnectorContext = {
    fetch: deps.fetch ?? globalThis.fetch,
    clientId: creds.clientId,
    clientSecret: creds.clientSecret,
    redirectUri: `${deps.config.CONTROL_PLANE_PUBLIC_URL.replace(/\/+$/, '')}/v1/oauth/callback/${connectorId}`,
  };

  let tokens: Awaited<ReturnType<Connector['refresh']>>;
  try {
    tokens = await connector.refresh(ctx, stored.tokens.refreshToken);
  } catch (err) {
    if (err instanceof ConnectorAuthError) {
      throw new RefreshError(
        'provider_rejected',
        `provider rejected refresh for ${connectionId}: ${err.message}`,
        err.status,
      );
    }
    throw new RefreshError(
      'transport_error',
      `transport error refreshing ${connectionId}: ${(err as Error).message}`,
    );
  }

  return updateConnectionTokens(
    { db: deps.db, encryptionKey: deps.encryptionKey },
    stored.id,
    tokens,
  );
}
