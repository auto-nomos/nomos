import type { Logger } from '../logger.js';

export interface PolicyInvalidator {
  /** Schedule a push-invalidation for this customer. Coalesces calls
   *  within `debounceMs` to avoid storms when many grants/policies land
   *  in a window. Fire-and-forget — failures are logged and the PDP's
   *  periodic refresh is the safety net. */
  invalidate(customerId: string): void;
  /** Force-flush every pending customer. Useful in tests + shutdown. */
  flush(): Promise<void>;
}

export interface PolicyInvalidatorOptions {
  /** Pre-parsed list of full webhook URLs (e.g.
   *  `http://pdp/v1/internal/refresh-policies`). Empty = noop. */
  webhookUrls: string[];
  /** Bearer token; same value the PDP requires on `/v1/internal/*`. */
  serviceToken: string;
  logger: Logger;
  fetch?: typeof fetch;
  /** Coalesce window. Defaults to 250ms. */
  debounceMs?: number;
  /** Per-request timeout in ms. Defaults to 2_000. */
  timeoutMs?: number;
}

/**
 * Push-invalidation for the PDP policy cache. Mirrors
 * `RevocationPublisher` but coalesces per-customer to avoid hammering the
 * PDP when many grants land within a short window (e.g. a bulk policy
 * import or a step-up approval that also writes a remember-grant).
 *
 * The PDP's `POLICY_REFRESH_MS` timer is the safety net — push failures
 * here are logged + swallowed.
 */
export function createPolicyInvalidator(opts: PolicyInvalidatorOptions): PolicyInvalidator {
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const debounceMs = opts.debounceMs ?? 250;
  const timeoutMs = opts.timeoutMs ?? 2_000;
  const pending = new Map<string, NodeJS.Timeout>();

  async function post(url: string, customerId: string): Promise<void> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${opts.serviceToken}`,
        },
        body: JSON.stringify({ customer_id: customerId }),
        signal: ac.signal,
      });
      if (!res.ok) {
        opts.logger.warn(
          { url, status: res.status, customerId },
          'pdp policy push returned non-2xx; relying on polling sweep',
        );
      }
    } catch (err) {
      opts.logger.warn(
        { err, url, customerId },
        'pdp policy push failed; relying on polling sweep',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async function fireFor(customerId: string): Promise<void> {
    pending.delete(customerId);
    if (opts.webhookUrls.length === 0) return;
    await Promise.all(opts.webhookUrls.map((url) => post(url, customerId)));
  }

  return {
    invalidate(customerId) {
      if (opts.webhookUrls.length === 0) return;
      const existing = pending.get(customerId);
      if (existing) clearTimeout(existing);
      const handle = setTimeout(() => {
        void fireFor(customerId);
      }, debounceMs);
      // Don't keep the event loop alive for tests
      if (typeof handle.unref === 'function') handle.unref();
      pending.set(customerId, handle);
    },
    async flush() {
      const ids = [...pending.keys()];
      for (const id of ids) {
        const t = pending.get(id);
        if (t) clearTimeout(t);
      }
      await Promise.all(ids.map(fireFor));
    },
  };
}

/** No-op invalidator for tests / when no webhooks configured. */
export function noopPolicyInvalidator(): PolicyInvalidator {
  return {
    invalidate: () => undefined,
    flush: async () => undefined,
  };
}
