import type { Logger } from '../logger.js';

export interface PolicyCache {
  getPolicies(customerId: string): string | undefined;
  set(customerId: string, policies: string): void;
  start(): void;
  stop(): void;
}

export interface PolicyCacheOptions {
  fetchBundle: (customerId: string) => Promise<string | undefined>;
  refreshIntervalMs: number;
  logger: Logger;
  /** customers to refresh on tick. The cache only refreshes customers it already knows about. */
  knownCustomers?: () => Iterable<string>;
}

export function createPolicyCache(options: PolicyCacheOptions): PolicyCache {
  const store = new Map<string, string>();
  let timer: NodeJS.Timeout | undefined;

  async function refreshOne(customerId: string): Promise<void> {
    try {
      const next = await options.fetchBundle(customerId);
      if (next !== undefined) {
        store.set(customerId, next);
      }
    } catch (err) {
      options.logger.error({ err, customerId }, 'policy refresh failed; serving stale');
    }
  }

  async function refreshAll(): Promise<void> {
    const customers = options.knownCustomers
      ? Array.from(options.knownCustomers())
      : [...store.keys()];
    await Promise.all(customers.map(refreshOne));
  }

  return {
    getPolicies(customerId) {
      return store.get(customerId);
    },
    set(customerId, policies) {
      store.set(customerId, policies);
    },
    start() {
      if (timer) return;
      timer = setInterval(() => {
        void refreshAll();
      }, options.refreshIntervalMs);
      // Don't keep the event loop alive for tests
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
