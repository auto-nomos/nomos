import type { Logger } from '../logger.js';

export interface RevocationCache {
  getRevoked(customerId: string): ReadonlySet<string>;
  set(customerId: string, cids: Iterable<string>): void;
  add(customerId: string, cid: string): void;
  /**
   * Force a fetch for one customer. Used by Sprint 8 push-revocation route
   * (control plane POSTs after a revoke; PDP refreshes immediately rather than
   * waiting for the 5s polling sweep).
   */
  refresh(customerId: string): Promise<void>;
  start(): void;
  stop(): void;
}

export interface RevocationCacheOptions {
  fetchRevocations: (customerId: string) => Promise<Iterable<string> | undefined>;
  refreshIntervalMs: number;
  logger: Logger;
  knownCustomers?: () => Iterable<string>;
}

export function createRevocationCache(options: RevocationCacheOptions): RevocationCache {
  const store = new Map<string, Set<string>>();
  let timer: NodeJS.Timeout | undefined;
  /**
   * Audit H8 (2026-05-24): concurrent push-revocation + sweep refreshes for
   * the same customer raced; the slower fetch's response could overwrite a
   * fresher set, briefly making revoked UCANs pass again. Dedup in-flight
   * refreshes per customer so the same response wins everywhere.
   */
  const inflight = new Map<string, Promise<void>>();

  async function refreshOne(customerId: string): Promise<void> {
    try {
      const next = await options.fetchRevocations(customerId);
      if (next !== undefined) {
        store.set(customerId, new Set(next));
      }
    } catch (err) {
      options.logger.error({ err, customerId }, 'revocation refresh failed; serving stale');
    }
  }

  function refreshOneDeduped(customerId: string): Promise<void> {
    const existing = inflight.get(customerId);
    if (existing) return existing;
    const promise = refreshOne(customerId).finally(() => {
      // Only clear if no later caller chained onto this exact promise — the
      // Map.set in refresh() always overwrites, so the get() above always
      // returns the most recent pending one.
      if (inflight.get(customerId) === promise) inflight.delete(customerId);
    });
    inflight.set(customerId, promise);
    return promise;
  }

  async function refreshAll(): Promise<void> {
    const customers = options.knownCustomers
      ? Array.from(options.knownCustomers())
      : [...store.keys()];
    await Promise.all(customers.map(refreshOneDeduped));
  }

  return {
    getRevoked(customerId) {
      return store.get(customerId) ?? new Set<string>();
    },
    set(customerId, cids) {
      store.set(customerId, new Set(cids));
    },
    add(customerId, cid) {
      const set = store.get(customerId);
      if (set) {
        set.add(cid);
      } else {
        store.set(customerId, new Set([cid]));
      }
    },
    async refresh(customerId) {
      await refreshOneDeduped(customerId);
    },
    start() {
      if (timer) return;
      timer = setInterval(() => {
        void refreshAll();
      }, options.refreshIntervalMs);
      if (typeof timer.unref === 'function') timer.unref();
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    },
  };
}
