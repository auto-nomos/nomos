import type { Logger } from '../logger.js';

export interface RevocationPublisher {
  publish(customerId: string, cid: string): Promise<PublishResult>;
}

export interface PublishResult {
  /** Number of webhooks the push reached with a 2xx response. */
  succeeded: number;
  /** Webhooks that errored or returned non-2xx. The PDP polling sweep is the safety net. */
  failed: number;
}

export interface RevocationPublisherOptions {
  /** Comma-separated list pre-parsed into URLs. Empty = noop. */
  webhookUrls: string[];
  /** Bearer token; same value the PDP requires on `/v1/internal/*`. */
  serviceToken: string;
  logger: Logger;
  /** Injectable for tests. Defaults to globalThis.fetch. */
  fetch?: typeof fetch;
  /** Per-request timeout in ms. Defaults to 2_000. */
  timeoutMs?: number;
}

/**
 * POSTs `{ customer_id, cid }` to every PDP webhook URL after a revoke. Each
 * webhook failure is logged but does not throw — the PDP's 5s polling sweep is
 * the fallback and the user-visible mutation must not fail because a
 * downstream PDP is offline.
 */
export function createRevocationPublisher(opts: RevocationPublisherOptions): RevocationPublisher {
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? 2_000;

  return {
    async publish(customerId, cid) {
      if (opts.webhookUrls.length === 0) {
        return { succeeded: 0, failed: 0 };
      }
      const results = await Promise.all(
        opts.webhookUrls.map((url) => postOne(url, customerId, cid)),
      );
      let succeeded = 0;
      let failed = 0;
      for (const r of results) {
        if (r.ok) succeeded++;
        else failed++;
      }
      return { succeeded, failed };
    },
  };

  async function postOne(
    url: string,
    customerId: string,
    cid: string,
  ): Promise<{ ok: true } | { ok: false }> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${opts.serviceToken}`,
        },
        body: JSON.stringify({ customer_id: customerId, cid }),
        signal: ac.signal,
      });
      if (!res.ok) {
        opts.logger.warn(
          { url, status: res.status, customerId, cid },
          'pdp revocation push returned non-2xx; relying on polling sweep',
        );
        return { ok: false };
      }
      return { ok: true };
    } catch (err) {
      opts.logger.warn(
        { err, url, customerId, cid },
        'pdp revocation push failed; relying on polling sweep',
      );
      return { ok: false };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** No-op publisher for tests / when no webhooks configured. */
export function noopRevocationPublisher(): RevocationPublisher {
  return {
    publish: async () => ({ succeeded: 0, failed: 0 }),
  };
}
