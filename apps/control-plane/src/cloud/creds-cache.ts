/**
 * In-memory session-creds cache for the cloud federation endpoints.
 *
 * Key: `${connectionId}|${scope}` (scope = canonical string per provider —
 * for Azure: AAD scope; for AWS: role-arn:region; for GCP: SA email).
 *
 * TTL is the lesser of:
 *   - creds.expiresAt - 60s safety margin (cred-natural)
 *   - 15min cap (AAD throttle defense; also limits revoke-staleness window)
 *
 * In-process only. Multi-replica control-plane sees lower hit ratio but
 * still benefits — Redis upgrade is a follow-up. Each replica's cache is
 * independent.
 *
 * Why control-plane not PDP: PDP can be multi-replica; control-plane
 * generally is too but cache lives where mint+exchange happens so we
 * skip both. Also keeps cloud creds bounded to the trusted control-plane
 * boundary.
 */

import type { CloudSessionCreds } from '@auto-nomos/core';

export interface CredsCache {
  get(connectionId: string, scope: string): CloudSessionCreds | undefined;
  set(connectionId: string, scope: string, creds: CloudSessionCreds): void;
  delete(connectionId: string): void;
  size(): number;
}

export interface CredsCacheOptions {
  /** Hard cap, applied even if creds.expiresAt is later. */
  maxTtlMs?: number;
  /** Safety margin before expiry. Default 60s. */
  safetyMarginMs?: number;
  /** Test override. */
  now?: () => number;
}

interface Entry {
  creds: CloudSessionCreds;
  expiresAtMs: number;
}

export function createCredsCache(opts: CredsCacheOptions = {}): CredsCache {
  const maxTtlMs = opts.maxTtlMs ?? 15 * 60 * 1000;
  const safetyMarginMs = opts.safetyMarginMs ?? 60 * 1000;
  const now = opts.now ?? (() => Date.now());
  const store = new Map<string, Entry>();

  return {
    get(connectionId, scope) {
      const key = `${connectionId}|${scope}`;
      const entry = store.get(key);
      if (!entry) return undefined;
      if (entry.expiresAtMs <= now()) {
        store.delete(key);
        return undefined;
      }
      return entry.creds;
    },
    set(connectionId, scope, creds) {
      const credExpiresAt = creds.expiresAt.getTime() - safetyMarginMs;
      const expiresAtMs = Math.min(credExpiresAt, now() + maxTtlMs);
      if (expiresAtMs <= now()) return; // already too stale to cache
      store.set(`${connectionId}|${scope}`, { creds, expiresAtMs });
    },
    delete(connectionId) {
      // Drop all scopes for this connection — used by tRPC disconnect.
      for (const key of store.keys()) {
        if (key.startsWith(`${connectionId}|`)) store.delete(key);
      }
    },
    size() {
      return store.size;
    },
  };
}

/** Per-provider scope-key derivation. Must match what the provider asks for. */
export function scopeKey(creds: CloudSessionCreds): string {
  switch (creds.kind) {
    case 'azure_bearer':
      return creds.scope;
    case 'aws_sigv4':
      return creds.region;
    case 'gcp_bearer':
      return 'cloud-platform';
  }
}
