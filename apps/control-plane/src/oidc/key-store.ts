/**
 * OIDC issuer key store.
 *
 * Reads `oidc_issuer_keys` rows for serving JWKS and selecting the active
 * signing key. Writes (rotation / publish) happen in a separate operator
 * tool — this module is read-only inside the request path.
 *
 * Rotation semantics:
 *   - `active` keys sign new tokens.
 *   - `next` keys are pre-published in JWKS so verifiers warm their caches
 *     before the cutover.
 *   - `retired` keys remain in JWKS for an overlap window so previously
 *     issued tokens still verify; the rotation script flips them out.
 */

import type { RsaPublicJwk } from '@auto-nomos/crypto';
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema.js';

export interface OidcKeyRow {
  kid: string;
  alg: string;
  status: 'active' | 'next' | 'retired';
  publicJwk: RsaPublicJwk;
  kmsKeyRef: string;
}

export interface KeyStore {
  /** Active key used for signing. Throws when no active key exists. */
  getActiveKey(): Promise<OidcKeyRow>;
  /** Active + next + retired (within overlap) — what /jwks.json publishes. */
  getPublishedKeys(): Promise<OidcKeyRow[]>;
}

function rowToKey(row: typeof schema.oidcIssuerKeys.$inferSelect): OidcKeyRow {
  return {
    kid: row.kid,
    alg: row.alg,
    status: row.status,
    publicJwk: row.publicJwk as RsaPublicJwk,
    kmsKeyRef: row.kmsKeyRef,
  };
}

export class DbKeyStore implements KeyStore {
  constructor(private readonly db: Db) {}

  async getActiveKey(): Promise<OidcKeyRow> {
    const [row] = await this.db.drizzle
      .select()
      .from(schema.oidcIssuerKeys)
      .where(eq(schema.oidcIssuerKeys.status, 'active'))
      .limit(1);
    if (!row) throw new Error('oidc_no_active_key');
    return rowToKey(row);
  }

  async getPublishedKeys(): Promise<OidcKeyRow[]> {
    const rows = await this.db.drizzle
      .select()
      .from(schema.oidcIssuerKeys)
      .where(inArray(schema.oidcIssuerKeys.status, ['active', 'next', 'retired']));
    return rows.map(rowToKey);
  }
}

/**
 * In-memory key store for tests and dev mode (when only OIDC_DEV_* env
 * vars are set and no row exists in the DB yet). One active key, no
 * rotation.
 */
export class StaticKeyStore implements KeyStore {
  private readonly key: OidcKeyRow;
  constructor(opts: { kid: string; publicJwk: RsaPublicJwk; kmsKeyRef?: string }) {
    this.key = {
      kid: opts.kid,
      alg: 'RS256',
      status: 'active',
      publicJwk: opts.publicJwk,
      kmsKeyRef: opts.kmsKeyRef ?? 'local-dev',
    };
  }
  async getActiveKey(): Promise<OidcKeyRow> {
    return this.key;
  }
  async getPublishedKeys(): Promise<OidcKeyRow[]> {
    return [this.key];
  }
}

/**
 * Wraps a key store with optional DB fallback: if the DB has no active
 * row but a dev signer is configured, return the dev key. Used at startup
 * so an operator can bootstrap a deployment by setting env vars before
 * the rotation tool has populated the table.
 */
export function withDevFallback(primary: KeyStore, devKey: OidcKeyRow | null): KeyStore {
  if (!devKey) return primary;
  return {
    async getActiveKey() {
      try {
        return await primary.getActiveKey();
      } catch (err) {
        if (err instanceof Error && err.message === 'oidc_no_active_key') return devKey;
        throw err;
      }
    },
    async getPublishedKeys() {
      const fromDb = await primary.getPublishedKeys();
      if (fromDb.length > 0) return fromDb;
      return [devKey];
    },
  };
}

/** Filter unused — eq+and re-exported only to document we may need them for rotation tool. */
export { and, eq };
