import type { Logger } from '../logger.js';

/**
 * Per-agent metadata included in the bundle so the PDP can enforce the
 * `connectionApprovedAt` gate without hitting the DB on the hot path.
 */
export interface AgentMeta {
  agentId: string;
  did: string;
  mode: 'static' | 'dynamic';
  status: 'active' | 'disabled' | 'deleted';
  connectionApprovedAt: string | null;
}

export interface BundleEntry {
  cedar: string;
  agents: AgentMeta[];
}

export interface PolicyCache {
  getPolicies(customerId: string): string | undefined;
  getAgentByDid(customerId: string, did: string): AgentMeta | undefined;
  getAgentById(customerId: string, agentId: string): AgentMeta | undefined;
  set(customerId: string, entry: BundleEntry | string): void;
  /** Force-fetch a single customer's bundle and update the cache. Used by
   *  the control-plane push-invalidation webhook so an approved grant is
   *  live in seconds rather than waiting for the next refresh tick. */
  refresh(customerId: string): Promise<void>;
  start(): void;
  stop(): void;
}

export interface PolicyCacheOptions {
  fetchBundle: (customerId: string) => Promise<BundleEntry | string | undefined>;
  refreshIntervalMs: number;
  logger: Logger;
  /** customers to refresh on tick. The cache only refreshes customers it already knows about. */
  knownCustomers?: () => Iterable<string>;
}

export function createPolicyCache(options: PolicyCacheOptions): PolicyCache {
  const store = new Map<string, BundleEntry>();
  let timer: NodeJS.Timeout | undefined;

  function normalize(value: BundleEntry | string): BundleEntry {
    return typeof value === 'string' ? { cedar: value, agents: [] } : value;
  }

  async function refreshOne(customerId: string): Promise<void> {
    try {
      const next = await options.fetchBundle(customerId);
      if (next !== undefined) {
        store.set(customerId, normalize(next));
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
      return store.get(customerId)?.cedar;
    },
    getAgentByDid(customerId, did) {
      return store.get(customerId)?.agents.find((a) => a.did === did);
    },
    getAgentById(customerId, agentId) {
      return store.get(customerId)?.agents.find((a) => a.agentId === agentId);
    },
    set(customerId, entry) {
      store.set(customerId, normalize(entry));
    },
    refresh: refreshOne,
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
