import type { Logger } from '../logger.js';

export interface RevocationCache {
  getRevoked(customerId: string): ReadonlySet<string>;
  set(customerId: string, cids: Iterable<string>): void;
  add(customerId: string, cid: string): void;
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

  async function refreshAll(): Promise<void> {
    const customers = options.knownCustomers
      ? Array.from(options.knownCustomers())
      : [...store.keys()];
    await Promise.all(customers.map(refreshOne));
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
