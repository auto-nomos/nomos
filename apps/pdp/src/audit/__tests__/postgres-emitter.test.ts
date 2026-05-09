import type { AuditEvent } from '@credential-broker/shared-types';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ZERO_HASH } from '../emit.js';
import {
  type AuditRow,
  createPostgresAuditEmitter,
  type PostgresAuditWriter,
} from '../postgres-emitter.js';
import { verifyAuditChain } from '../verify.js';

const logger = pino({ level: 'silent' });

const cust = '550e8400-e29b-41d4-a716-446655440000';
const cust2 = '550e8400-e29b-41d4-a716-446655440001';

function makeInput(overrides: Partial<{ ts: number; command: string; customer_id: string }> = {}) {
  return {
    customer_id: cust,
    ts: 1_700_000_000_000,
    agent: 'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH',
    decision: 'allow' as const,
    command: '/github/issue/create',
    resource: { repo: 'acme/billing' } as Record<string, unknown>,
    context: { ip: '1.2.3.4' } as Record<string, unknown>,
    ...overrides,
  };
}

interface FakeStore {
  rows: AuditRow[];
  writer: PostgresAuditWriter;
  insertCalls: number;
}

function fakeWriter(initialPerCustomer: Record<string, string> = {}): FakeStore {
  const store: FakeStore = {
    rows: [],
    insertCalls: 0,
    // populated below
    writer: undefined as unknown as PostgresAuditWriter,
  };
  store.writer = {
    async fetchLastHash(customerId) {
      // Newest insertion wins (ts may collide; emitter pushes in order).
      const inDb = [...store.rows].reverse().find((r) => r.customer_id === customerId);
      if (inDb) return inDb.hash;
      return initialPerCustomer[customerId];
    },
    async insertBatch(rows) {
      store.insertCalls++;
      store.rows.push(...rows);
    },
  };
  return store;
}

describe('createPostgresAuditEmitter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('chains prev_hash from ZERO_HASH for a fresh customer', async () => {
    const store = fakeWriter();
    const emitter = createPostgresAuditEmitter({ writer: store.writer, logger });
    const ev = await emitter.emit(makeInput());
    expect(ev.prev_hash).toBe(ZERO_HASH);
    expect(ev.hash).toMatch(/^[0-9a-f]{64}$/);
    await emitter.flush();
    expect(store.rows).toHaveLength(1);
  });

  it('chains subsequent emits to the previous hash within one customer', async () => {
    const store = fakeWriter();
    const emitter = createPostgresAuditEmitter({ writer: store.writer, logger });
    const a = await emitter.emit(makeInput());
    const b = await emitter.emit(makeInput({ command: '/x/1' }));
    const c = await emitter.emit(makeInput({ command: '/x/2' }));
    expect(b.prev_hash).toBe(a.hash);
    expect(c.prev_hash).toBe(b.hash);
    expect(emitter.getLastHash(cust)).toBe(c.hash);
    await emitter.flush();
    expect(verifyAuditChain([a, b, c] as AuditEvent[]).ok).toBe(true);
  });

  it('keeps separate chains per customer', async () => {
    const store = fakeWriter();
    const emitter = createPostgresAuditEmitter({ writer: store.writer, logger });
    const a1 = await emitter.emit(makeInput());
    const b1 = await emitter.emit(makeInput({ customer_id: cust2 }));
    const a2 = await emitter.emit(makeInput({ command: '/x/2' }));
    expect(a1.prev_hash).toBe(ZERO_HASH);
    expect(b1.prev_hash).toBe(ZERO_HASH);
    expect(a2.prev_hash).toBe(a1.hash);
    expect(emitter.getLastHash(cust)).toBe(a2.hash);
    expect(emitter.getLastHash(cust2)).toBe(b1.hash);
    await emitter.flush();
    expect(verifyAuditChain([a1, a2] as AuditEvent[]).ok).toBe(true);
    expect(verifyAuditChain([b1] as AuditEvent[]).ok).toBe(true);
  });

  it('hydrates lastHash from DB on first emit for a known-existing customer', async () => {
    const seed = 'a'.repeat(64);
    const store = fakeWriter({ [cust]: seed });
    const emitter = createPostgresAuditEmitter({ writer: store.writer, logger });
    const ev = await emitter.emit(makeInput());
    expect(ev.prev_hash).toBe(seed);
  });

  it('flushes automatically every flushIntervalMs ticks', async () => {
    const store = fakeWriter();
    const emitter = createPostgresAuditEmitter({
      writer: store.writer,
      logger,
      flushIntervalMs: 100,
    });
    emitter.start();
    await emitter.emit(makeInput());
    expect(store.rows).toHaveLength(0); // not yet flushed
    await vi.advanceTimersByTimeAsync(100);
    expect(store.rows).toHaveLength(1);
    await emitter.stop();
  });

  it('flushes immediately when batchSizeMax is exceeded', async () => {
    const store = fakeWriter();
    const emitter = createPostgresAuditEmitter({
      writer: store.writer,
      logger,
      batchSizeMax: 3,
      flushIntervalMs: 60_000, // long interval — proves the size trigger
    });
    await emitter.emit(makeInput({ command: '/x/0' }));
    await emitter.emit(makeInput({ command: '/x/1' }));
    expect(store.rows).toHaveLength(0);
    await emitter.emit(makeInput({ command: '/x/2' })); // hits threshold
    // emit() doesn't await the flush — give microtasks time to settle.
    await vi.runAllTimersAsync();
    expect(store.rows).toHaveLength(3);
  });

  it('stop() flushes any remaining events', async () => {
    const store = fakeWriter();
    const emitter = createPostgresAuditEmitter({
      writer: store.writer,
      logger,
      flushIntervalMs: 60_000, // never auto-fires inside the test window
    });
    emitter.start();
    await emitter.emit(makeInput());
    await emitter.emit(makeInput({ command: '/x/1' }));
    await emitter.stop();
    expect(store.rows).toHaveLength(2);
  });

  it('does not crash when insertBatch throws; events are dropped + logged', async () => {
    const errLogger = pino({ level: 'silent' });
    const errSpy = vi.spyOn(errLogger, 'error');
    const writer: PostgresAuditWriter = {
      fetchLastHash: async () => undefined,
      insertBatch: async () => {
        throw new Error('boom');
      },
    };
    const emitter = createPostgresAuditEmitter({
      writer,
      logger: errLogger,
      flushIntervalMs: 60_000,
    });
    await emitter.emit(makeInput());
    await emitter.flush();
    expect(errSpy).toHaveBeenCalled();
  });

  it('start() is idempotent', async () => {
    const store = fakeWriter();
    const emitter = createPostgresAuditEmitter({
      writer: store.writer,
      logger,
      flushIntervalMs: 100,
    });
    emitter.start();
    emitter.start();
    await emitter.emit(makeInput());
    await vi.advanceTimersByTimeAsync(100);
    expect(store.insertCalls).toBe(1); // exactly one timer firing
    await emitter.stop();
  });

  it('row payload contains the canonical pre-hash representation', async () => {
    const store = fakeWriter();
    const emitter = createPostgresAuditEmitter({ writer: store.writer, logger });
    const ev = await emitter.emit(makeInput());
    await emitter.flush();
    const row = store.rows[0]!;
    expect(row.payload).toMatchObject({
      event_id: ev.event_id,
      prev_hash: ev.prev_hash,
      command: ev.command,
      customer_id: ev.customer_id,
    });
    expect((row.payload as { hash?: string }).hash).toBeUndefined();
  });
});
