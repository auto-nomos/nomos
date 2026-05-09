/**
 * Integration: PDP audit writer hits real postgres, hash chain survives a
 * round-trip, verifyAuditChain validates rows read back from the DB.
 *
 * Requires postgres. SKIP_DB_TESTS=1 to skip.
 */
import type { AuditEvent } from '@credential-broker/shared-types';
import pg from 'pg';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPostgresAuditEmitter } from '../postgres-emitter.js';
import { createPgAuditWriter } from '../postgres-writer.js';
import { verifyAuditChain } from '../verify.js';

const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://cb:cb@localhost:5433/cb_dev';
const RUN = !process.env.SKIP_DB_TESTS;

const logger = pino({ level: 'silent' });
const agent = 'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH';

describe.skipIf(!RUN)('PDP postgres audit writer (requires postgres)', () => {
  let pool: pg.Pool;
  const cleanupCustomerIds: string[] = [];

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: TEST_URL });
    try {
      await pool.query('SELECT 1');
    } catch (err) {
      throw new Error(`Postgres not reachable: ${(err as Error).message}`);
    }
  });

  afterAll(async () => {
    for (const id of cleanupCustomerIds) {
      await pool.query('DELETE FROM customers WHERE id = $1', [id]);
    }
    await pool.end();
  });

  async function newCustomer(): Promise<string> {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO customers (name) VALUES ($1) RETURNING id`,
      [`pdp-audit-${Date.now()}-${Math.random()}`],
    );
    const id = r.rows[0]!.id;
    cleanupCustomerIds.push(id);
    return id;
  }

  async function readRows(customerId: string): Promise<AuditEvent[]> {
    const r = await pool.query<{
      event_id: string;
      customer_id: string;
      ts: Date;
      agent: string;
      decision: 'allow' | 'deny' | 'stepup';
      command: string;
      resource: Record<string, unknown>;
      context: Record<string, unknown>;
      prev_hash: string;
      hash: string;
    }>(
      `SELECT event_id, customer_id, ts, agent, decision, command, resource, context, prev_hash, hash
       FROM audit_events
       WHERE customer_id = $1
       ORDER BY ts ASC, prev_hash ASC`,
      [customerId],
    );
    return r.rows.map((row) => ({
      event_id: row.event_id,
      customer_id: row.customer_id,
      ts: row.ts.getTime(),
      agent: row.agent,
      decision: row.decision,
      command: row.command,
      resource: row.resource,
      context: row.context,
      prev_hash: row.prev_hash,
      hash: row.hash,
    }));
  }

  it('writes a chained batch the verifier accepts', async () => {
    const customerId = await newCustomer();
    const emitter = createPostgresAuditEmitter({
      writer: createPgAuditWriter(pool),
      logger,
      flushIntervalMs: 60_000,
    });
    const events: AuditEvent[] = [];
    const baseTs = Date.now();
    for (let i = 0; i < 5; i++) {
      events.push(
        await emitter.emit({
          customer_id: customerId,
          ts: baseTs + i,
          agent,
          decision: 'allow',
          command: '/x/y',
          resource: { i },
          context: { ip: '1.2.3.4' },
        }),
      );
    }
    await emitter.flush();
    const stored = await readRows(customerId);
    expect(stored).toHaveLength(5);
    expect(verifyAuditChain(stored).ok).toBe(true);
  });

  it('hydrates lastHash from prior rows on a fresh emitter', async () => {
    const customerId = await newCustomer();
    // First emitter writes 2 events, then is discarded.
    const e1 = createPostgresAuditEmitter({
      writer: createPgAuditWriter(pool),
      logger,
      flushIntervalMs: 60_000,
    });
    const baseTs = Date.now();
    const a = await e1.emit({
      customer_id: customerId,
      ts: baseTs,
      agent,
      decision: 'allow',
      command: '/x/1',
      resource: {},
      context: {},
    });
    const b = await e1.emit({
      customer_id: customerId,
      ts: baseTs + 1,
      agent,
      decision: 'allow',
      command: '/x/2',
      resource: {},
      context: {},
    });
    await e1.flush();

    // Second emitter (process restart sim) should chain from b.hash, not ZERO_HASH.
    const e2 = createPostgresAuditEmitter({
      writer: createPgAuditWriter(pool),
      logger,
      flushIntervalMs: 60_000,
    });
    const c = await e2.emit({
      customer_id: customerId,
      ts: baseTs + 2,
      agent,
      decision: 'allow',
      command: '/x/3',
      resource: {},
      context: {},
    });
    await e2.flush();
    expect(c.prev_hash).toBe(b.hash);

    const stored = await readRows(customerId);
    expect(stored).toHaveLength(3);
    expect(verifyAuditChain(stored).ok).toBe(true);
    expect(stored[0]!.event_id).toBe(a.event_id);
  });
});
