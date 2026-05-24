import { randomUUID } from 'node:crypto';
import { sha256Hex } from '@auto-nomos/crypto';
import type { AuditEvent } from '@auto-nomos/shared-types';
import { canonicalize } from '@auto-nomos/ucan';
import type { Logger } from '../logger.js';
import type { AuditEventInput } from './emit.js';
import { ZERO_HASH } from './emit.js';

/**
 * One DB row's worth of data — the AuditEvent plus the canonical `payload`
 * jsonb column that the verifier rehashes against `hash`.
 */
export interface AuditRow extends AuditEvent {
  payload: Record<string, unknown>;
}

export interface PostgresAuditEmitter {
  /** Compute hash chain entry, push onto pending queue, possibly trigger flush. */
  emit(input: AuditEventInput): Promise<AuditEvent>;
  /** Last hash for a customer (in-memory; reflects pending writes). */
  getLastHash(customerId: string): string;
  /** Force-flush pending events. Awaiting resolves only when DB write is done. */
  flush(): Promise<void>;
  /** Start the periodic flush timer. */
  start(): void;
  /** Stop the timer + flush remaining. */
  stop(): Promise<void>;
}

/**
 * Storage adapter. Writer is pluggable so tests can swap a fake in for unit
 * tests; the production impl in `postgres-writer.ts` issues a single bulk
 * INSERT against the audit_events table.
 */
export interface PostgresAuditWriter {
  fetchLastHash(customerId: string): Promise<string | undefined>;
  insertBatch(rows: AuditRow[]): Promise<void>;
}

export interface PostgresAuditEmitterOptions {
  writer: PostgresAuditWriter;
  /** Default 100ms — every interval, pending events are flushed. */
  flushIntervalMs?: number;
  /** Default 100 — when pending exceeds this, flush is triggered immediately. */
  batchSizeMax?: number;
  logger: Logger;
  /**
   * Audit C3 — per-customer genesis seed. When provided, the first event
   * for a customer uses `genesisFor(customerId)` as `prev_hash` instead of
   * `ZERO_HASH`. The verifier needs the same function (or the same secret)
   * to re-derive. Omit for back-compat with existing dev/test deployments;
   * production should always set it. See `auditGenesisHash()` in emit.ts.
   */
  genesisFor?: (customerId: string) => string;
}

/**
 * Per-customer hash-chain emitter that writes audit events to Postgres in
 * micro-batches.
 *
 * Sprint 8.2: replaces the Sprint-2 JSONL file writer. The chain still uses
 * sha256Hex(prevHash || canonicalize(partial)) so existing verifyAuditChain
 * works unchanged.
 *
 * Trade-off: a process crash between `emit()` returning and the next flush
 * loses up to one batch of events. We accept this in Phase 1 — the alternative
 * is sync writes per event (kills authorize p99). Phase 2 can add WAL.
 */
export function createPostgresAuditEmitter(
  opts: PostgresAuditEmitterOptions,
): PostgresAuditEmitter {
  const flushIntervalMs = opts.flushIntervalMs ?? 100;
  const batchSizeMax = opts.batchSizeMax ?? 100;

  const lastHashByCustomer = new Map<string, string>();
  const hydrating = new Map<string, Promise<string>>();
  let pending: AuditRow[] = [];
  let timer: NodeJS.Timeout | undefined;
  let flushing: Promise<void> | undefined;

  function genesisOf(customerId: string): string {
    return opts.genesisFor ? opts.genesisFor(customerId) : ZERO_HASH;
  }

  async function ensureLastHash(customerId: string): Promise<string> {
    const cached = lastHashByCustomer.get(customerId);
    if (cached !== undefined) return cached;
    const inflight = hydrating.get(customerId);
    if (inflight) return inflight;
    const p = opts.writer.fetchLastHash(customerId).then((fromDb) => {
      // Audit C3 — no DB row yet => use per-customer pinned genesis (if
      // configured) instead of the universal ZERO_HASH so an attacker
      // without the env secret can't fabricate a believable first event.
      const v = fromDb ?? genesisOf(customerId);
      // Concurrent emits would all try to seed; first-writer-wins.
      const existing = lastHashByCustomer.get(customerId);
      if (existing !== undefined) {
        hydrating.delete(customerId);
        return existing;
      }
      lastHashByCustomer.set(customerId, v);
      hydrating.delete(customerId);
      return v;
    });
    hydrating.set(customerId, p);
    return p;
  }

  async function emit(input: AuditEventInput): Promise<AuditEvent> {
    const eventId = randomUUID();
    const prevHash = await ensureLastHash(input.customer_id);
    const partial = {
      event_id: eventId,
      prev_hash: prevHash,
      ...input,
    };
    const hash = sha256Hex(
      `${prevHash}|${canonicalize(partial as unknown as Record<string, unknown>)}`,
    );
    const event: AuditEvent = { ...partial, hash };
    lastHashByCustomer.set(input.customer_id, hash);
    pending.push({ ...event, payload: partial as unknown as Record<string, unknown> });
    if (pending.length >= batchSizeMax) {
      // Don't await — caller already returned; don't block on DB.
      void flush();
    }
    return event;
  }

  async function flush(): Promise<void> {
    if (flushing) {
      await flushing;
      // After waiting, recurse so a second batch (queued during flight) gets written.
      if (pending.length > 0) {
        await flush();
      }
      return;
    }
    if (pending.length === 0) return;
    const rows = pending;
    pending = [];
    flushing = opts.writer
      .insertBatch(rows)
      .catch((err: unknown) => {
        // Failed batches are dropped. Re-queueing risks chain breaks: if some rows
        // landed and others didn't, prev_hash would refer to a row that may or
        // may not be in the DB. Phase 2 hardens this with a WAL + reconcile.
        opts.logger.error({ err, count: rows.length }, 'audit batch flush failed; events lost');
      })
      .finally(() => {
        flushing = undefined;
      });
    await flushing;
  }

  function start(): void {
    if (timer) return;
    timer = setInterval(() => {
      void flush();
    }, flushIntervalMs);
    if (typeof timer.unref === 'function') timer.unref();
  }

  async function stop(): Promise<void> {
    if (timer) clearInterval(timer);
    timer = undefined;
    await flush();
  }

  return {
    emit,
    getLastHash: (customerId) => lastHashByCustomer.get(customerId) ?? genesisOf(customerId),
    flush,
    start,
    stop,
  };
}
