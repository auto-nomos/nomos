/**
 * OAuth token persistence — encrypts tokens at rest with @auto-nomos/crypto's
 * XChaCha20-Poly1305 secretbox (Sprint 5 master key, per-row nonce; per-customer
 * KMS deferred to Phase 2) and writes them through Drizzle into oauth_connections.
 *
 * The rest of the platform never touches the raw secretbox API — it goes
 * through `saveConnection` / `loadConnection` / `updateConnectionTokens` so
 * the encryption boundary stays in one file.
 */
import { openString, sealString } from '@auto-nomos/crypto';
import { and, eq } from 'drizzle-orm';
import type { DrizzleClient } from '../db/index.js';
import * as schema from '../db/schema.js';
import type { ConnectorId, OAuthTokens } from './connector.js';

export interface StoredConnection {
  id: string;
  customerId: string;
  connector: ConnectorId;
  accountId: string;
  tokens: OAuthTokens;
  createdAt: Date;
  updatedAt: Date;
}

export interface SaveConnectionInput {
  customerId: string;
  connector: ConnectorId;
  tokens: OAuthTokens;
}

export interface TokensServiceDeps {
  db: DrizzleClient;
  /** 32-byte master key for token encryption. */
  encryptionKey: Uint8Array;
}

function tokensToRow(deps: TokensServiceDeps, t: OAuthTokens) {
  const refresh =
    t.refreshToken === ''
      ? { encryptedRefreshToken: '', refreshTokenNonce: '' }
      : (() => {
          const sealed = sealString(deps.encryptionKey, t.refreshToken);
          return {
            encryptedRefreshToken: sealed.ciphertextHex,
            refreshTokenNonce: sealed.nonceHex,
          };
        })();
  const access =
    t.accessToken === ''
      ? { encryptedAccessToken: null as string | null, accessTokenNonce: null as string | null }
      : (() => {
          const sealed = sealString(deps.encryptionKey, t.accessToken);
          return {
            encryptedAccessToken: sealed.ciphertextHex,
            accessTokenNonce: sealed.nonceHex,
          };
        })();
  return {
    encryptedRefreshToken: refresh.encryptedRefreshToken,
    refreshTokenNonce: refresh.refreshTokenNonce,
    refreshTokenExpiresAt: t.refreshTokenExpiresAt,
    encryptedAccessToken: access.encryptedAccessToken,
    accessTokenNonce: access.accessTokenNonce,
    accessTokenExpiresAt: t.accessTokenExpiresAt,
    scopesGranted: t.scopesGranted,
  };
}

function rowToTokens(
  deps: TokensServiceDeps,
  row: typeof schema.oauthConnections.$inferSelect,
): OAuthTokens {
  const refreshToken =
    row.encryptedRefreshToken === '' || row.refreshTokenNonce === ''
      ? ''
      : openString(deps.encryptionKey, row.encryptedRefreshToken, row.refreshTokenNonce);
  const accessToken =
    row.encryptedAccessToken && row.accessTokenNonce
      ? openString(deps.encryptionKey, row.encryptedAccessToken, row.accessTokenNonce)
      : '';
  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAt: row.accessTokenExpiresAt,
    refreshTokenExpiresAt: row.refreshTokenExpiresAt,
    scopesGranted: row.scopesGranted,
    accountId: row.accountId,
  };
}

/**
 * Insert or replace the OAuth connection for (customer, connector). Most
 * customers connect a single account per provider so we treat
 * (customer_id, connector, account_id) as the natural key and upsert on it.
 */
export async function saveConnection(
  deps: TokensServiceDeps,
  input: SaveConnectionInput,
): Promise<StoredConnection> {
  const row = tokensToRow(deps, input.tokens);
  const now = new Date();

  const existing = await deps.db.query.oauthConnections.findFirst({
    where: and(
      eq(schema.oauthConnections.customerId, input.customerId),
      eq(schema.oauthConnections.connector, input.connector),
      eq(schema.oauthConnections.accountId, input.tokens.accountId),
    ),
  });

  if (existing) {
    const [updated] = await deps.db
      .update(schema.oauthConnections)
      .set({ ...row, updatedAt: now })
      .where(eq(schema.oauthConnections.id, existing.id))
      .returning();
    if (!updated) throw new Error('oauth connection update returned no row');
    return rowToStored(deps, updated);
  }

  const [inserted] = await deps.db
    .insert(schema.oauthConnections)
    .values({
      customerId: input.customerId,
      connector: input.connector,
      accountId: input.tokens.accountId,
      ...row,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!inserted) throw new Error('oauth connection insert returned no row');
  return rowToStored(deps, inserted);
}

/** Load + decrypt the connection for (customer, connector). */
export async function loadConnection(
  deps: TokensServiceDeps,
  customerId: string,
  connector: ConnectorId,
): Promise<StoredConnection | null> {
  const row = await deps.db.query.oauthConnections.findFirst({
    where: and(
      eq(schema.oauthConnections.customerId, customerId),
      eq(schema.oauthConnections.connector, connector),
    ),
  });
  if (!row) return null;
  return rowToStored(deps, row);
}

/**
 * Load by the connection's own id. Used by the proxy adapter where the UCAN
 * carries `meta.oauth_connection_id` and we already know which connection
 * to use without re-running customer/connector lookups.
 */
export async function loadConnectionById(
  deps: TokensServiceDeps,
  customerId: string,
  connectionId: string,
): Promise<StoredConnection | null> {
  const row = await deps.db.query.oauthConnections.findFirst({
    where: and(
      eq(schema.oauthConnections.id, connectionId),
      eq(schema.oauthConnections.customerId, customerId),
    ),
  });
  if (!row) return null;
  return rowToStored(deps, row);
}

/** Replace the cached tokens on an existing connection (post-refresh). */
export async function updateConnectionTokens(
  deps: TokensServiceDeps,
  connectionId: string,
  tokens: OAuthTokens,
): Promise<StoredConnection> {
  const row = tokensToRow(deps, tokens);
  const [updated] = await deps.db
    .update(schema.oauthConnections)
    .set({ ...row, accountId: tokens.accountId, updatedAt: new Date() })
    .where(eq(schema.oauthConnections.id, connectionId))
    .returning();
  if (!updated) throw new Error(`oauth connection ${connectionId} not found`);
  return rowToStored(deps, updated);
}

function rowToStored(
  deps: TokensServiceDeps,
  row: typeof schema.oauthConnections.$inferSelect,
): StoredConnection {
  return {
    id: row.id,
    customerId: row.customerId,
    // DB enum is wider than ConnectorId (covers in-progress YAML adapters);
    // implementations only mint rows for known IDs so the cast is safe.
    connector: row.connector as ConnectorId,
    accountId: row.accountId,
    tokens: rowToTokens(deps, row),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const __test = { tokensToRow, rowToTokens };
