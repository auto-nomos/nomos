/**
 * Integration: audit-archive worker writes Parquet files to a fake uploader
 * and the produced parquet round-trips through @dsnp/parquetjs reader.
 *
 * Requires postgres. SKIP_DB_TESTS=1 to skip.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import parquet from '@dsnp/parquetjs';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/index.js';
import * as schema from '../db/schema.js';
import {
  type AuditArchiveUploader,
  createAuditArchiveWorker,
  floorToHour,
  objectKey,
} from '../workers/audit-archive.js';

const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://cb:cb@localhost:5433/cb_dev';
const RUN = !process.env.SKIP_DB_TESTS;

const logger = pino({ level: 'silent' });

interface FakeUpload {
  uploader: AuditArchiveUploader;
  uploads: { key: string; body: Buffer }[];
}

function fakeUploader(): FakeUpload {
  const uploads: { key: string; body: Buffer }[] = [];
  return {
    uploads,
    uploader: {
      async upload(key, body) {
        uploads.push({ key, body });
      },
    },
  };
}

describe.skipIf(!RUN)('audit archive worker (requires postgres)', () => {
  let db: Db;
  const cleanupCustomerIds: string[] = [];

  beforeAll(async () => {
    db = createDb({ DATABASE_URL: TEST_URL });
    try {
      await db.pool.query('SELECT 1');
    } catch (err) {
      throw new Error(`Postgres not reachable: ${(err as Error).message}`);
    }
  });

  afterAll(async () => {
    for (const id of cleanupCustomerIds) {
      await db.pool.query('DELETE FROM customers WHERE id = $1', [id]);
    }
    await db.pool.end();
  });

  async function newCustomer(): Promise<string> {
    const [c] = await db.drizzle
      .insert(schema.customers)
      .values({ name: `archive-${Date.now()}-${Math.random()}` })
      .returning();
    cleanupCustomerIds.push(c!.id);
    return c!.id;
  }

  async function emit(
    customerId: string,
    overrides: Partial<typeof schema.auditEvents.$inferInsert> = {},
  ): Promise<void> {
    const hash =
      typeof overrides.hash === 'string'
        ? overrides.hash
        : `h-${Date.now()}-${Math.random()}-${Math.random()}`;
    await db.drizzle.insert(schema.auditEvents).values({
      customerId,
      agent: 'did:key:z6MkTest',
      decision: 'allow',
      command: '/x/y',
      resource: { foo: 'bar' },
      context: { ip: '1.2.3.4' },
      prevHash: '0'.repeat(64),
      hash,
      payload: { ts: Date.now(), command: '/x/y' },
      ...overrides,
    });
  }

  it('writes a Parquet upload per customer for the queried window', async () => {
    const a = await newCustomer();
    const b = await newCustomer();
    const start = new Date('2026-05-09T10:00:00Z');
    const end = new Date('2026-05-09T11:00:00Z');
    await emit(a, { ts: new Date('2026-05-09T10:15:00Z') });
    await emit(a, { ts: new Date('2026-05-09T10:45:00Z') });
    await emit(b, { ts: new Date('2026-05-09T10:30:00Z') });
    // Out-of-window — should not be archived.
    await emit(a, { ts: new Date('2026-05-09T11:30:00Z') });

    const fake = fakeUploader();
    const worker = createAuditArchiveWorker({
      db: db.drizzle,
      uploader: fake.uploader,
      intervalMs: 60_000,
      logger,
    });

    const result = await worker.archiveHour(start, end);
    worker.stop();
    expect(result.rows).toBe(3);
    expect(result.uploaded).toHaveLength(2);
    expect(result.uploaded).toEqual(
      expect.arrayContaining([`${a}/2026/05/09/10.parquet`, `${b}/2026/05/09/10.parquet`]),
    );
    expect(fake.uploads).toHaveLength(2);
  });

  it('produces a Parquet that round-trips through the reader', async () => {
    const customerId = await newCustomer();
    const start = new Date('2026-05-09T12:00:00Z');
    const end = new Date('2026-05-09T13:00:00Z');
    await emit(customerId, { ts: new Date('2026-05-09T12:10:00Z'), hash: 'h-roundtrip-1' });
    await emit(customerId, { ts: new Date('2026-05-09T12:20:00Z'), hash: 'h-roundtrip-2' });

    const fake = fakeUploader();
    const worker = createAuditArchiveWorker({
      db: db.drizzle,
      uploader: fake.uploader,
      intervalMs: 60_000,
      logger,
    });
    await worker.archiveHour(start, end);
    worker.stop();

    expect(fake.uploads).toHaveLength(1);
    const upload = fake.uploads[0]!;

    // Write to a temp file because @dsnp/parquetjs reader API is file-based.
    const dir = mkdtempSync(join(tmpdir(), 'cb-archive-'));
    const filePath = join(dir, 'archive.parquet');
    writeFileSync(filePath, upload.body);
    try {
      const reader = await parquet.ParquetReader.openFile(filePath);
      const cursor = reader.getCursor();
      const rows: Record<string, unknown>[] = [];
      let row: unknown;
      // biome-ignore lint/suspicious/noAssignInExpressions: parquet cursor idiom
      while ((row = await cursor.next())) {
        rows.push(row as Record<string, unknown>);
      }
      await reader.close();
      const hashes = rows.map((r) => r.hash as string).sort();
      expect(hashes).toEqual(['h-roundtrip-1', 'h-roundtrip-2']);
      const sample = rows[0]!;
      expect(typeof sample.event_id).toBe('string');
      expect(JSON.parse(sample.resource as string)).toEqual({ foo: 'bar' });
      // Ensure the written buffer matches what we re-read back from disk.
      expect(readFileSync(filePath).equals(upload.body)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns rows=0 + uploads=[] for an empty window', async () => {
    const fake = fakeUploader();
    const worker = createAuditArchiveWorker({
      db: db.drizzle,
      uploader: fake.uploader,
      intervalMs: 60_000,
      logger,
    });
    const result = await worker.archiveHour(
      new Date('2030-01-01T00:00:00Z'),
      new Date('2030-01-01T01:00:00Z'),
    );
    worker.stop();
    expect(result).toEqual({ rows: 0, uploaded: [] });
    expect(fake.uploads).toHaveLength(0);
  });

  it('objectKey + floorToHour produce the documented R2 path', () => {
    const end = floorToHour(new Date('2026-05-09T10:42:13.500Z'));
    expect(end.toISOString()).toBe('2026-05-09T10:00:00.000Z');
    expect(
      objectKey('11111111-2222-3333-4444-555555555555', new Date('2026-05-09T11:00:00Z')),
    ).toBe('11111111-2222-3333-4444-555555555555/2026/05/09/10.parquet');
  });
});
