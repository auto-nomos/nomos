/**
 * Cloud-audit publisher — fire-and-forget POST to PDP after every
 * mintIdToken / acquireSessionCreds so plan §6 "three audit kinds"
 * (cloud.token.minted + cloud.federation.exchanged + cloud.call.allowed)
 * land in the per-customer hash chain.
 *
 * PDP owns the chain: it writes cloud.call.allowed from its proxy route
 * and routes the two CP-side kinds here. Single writer = no race.
 * Failures are logged, never thrown — audit drift is preferable to
 * blocking a federated call on PDP unreachability.
 */
import type { Logger } from '../logger.js';

export type CloudAuditKind =
  | 'cloud.token.minted'
  | 'cloud.federation.exchanged'
  | 'cloud.federation.exchanged.failed';

export interface CloudAuditInput {
  kind: CloudAuditKind;
  customerId: string;
  agentId: string;
  connectionId: string;
  connector: 'azure' | 'aws' | 'gcp';
  command?: string;
  jti?: string;
  retryable?: boolean;
  error?: string;
  /**
   * MAOS-A chain context — forwarded by PDP via /v1/internal/cloud/api-call,
   * passed through to the PDP webhook so cloud audit rows correlate to the
   * same swarm + parent receipt as the PDP-emitted cloud.call row.
   */
  parentReceiptId?: string;
  swarmId?: string;
  chainDepth?: number;
}

export interface CloudAuditPublisher {
  publish(input: CloudAuditInput): Promise<void>;
}

export interface CloudAuditPublisherOptions {
  webhookUrls: string[];
  serviceToken: string;
  logger: Logger;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export function createCloudAuditPublisher(opts: CloudAuditPublisherOptions): CloudAuditPublisher {
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? 1_500;

  return {
    async publish(input) {
      if (opts.webhookUrls.length === 0) return;
      const body = JSON.stringify({
        kind: input.kind,
        customer_id: input.customerId,
        agent_id: input.agentId,
        connection_id: input.connectionId,
        connector: input.connector,
        ...(input.command ? { command: input.command } : {}),
        ...(input.jti ? { jti: input.jti } : {}),
        ...(input.retryable !== undefined ? { retryable: input.retryable } : {}),
        ...(input.error ? { error: input.error } : {}),
        ...(input.parentReceiptId ? { parent_receipt_id: input.parentReceiptId } : {}),
        ...(input.swarmId ? { swarm_id: input.swarmId } : {}),
        ...(typeof input.chainDepth === 'number' ? { chain_depth: input.chainDepth } : {}),
      });
      await Promise.all(opts.webhookUrls.map((url) => postOne(url, body)));
    },
  };

  async function postOne(url: string, body: string): Promise<void> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${opts.serviceToken}`,
        },
        body,
        signal: ac.signal,
      });
      if (!res.ok) {
        opts.logger.warn({ url, status: res.status }, 'cloud audit publish returned non-2xx');
      }
    } catch (err) {
      opts.logger.warn({ err, url }, 'cloud audit publish failed');
    } finally {
      clearTimeout(timer);
    }
  }
}

export function noopCloudAuditPublisher(): CloudAuditPublisher {
  return { publish: async () => {} };
}
