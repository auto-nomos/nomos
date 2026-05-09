import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import parquet from '@dsnp/parquetjs';
import { and, gte, lt } from 'drizzle-orm';
import type { DrizzleClient } from '../db/index.js';
import * as schema from '../db/schema.js';
import type { Logger } from '../logger.js';

/**
 * Sprint 8.5 — every hour, dump the previous hour's audit_events to a Parquet
 * file and upload to Cloudflare R2. One file per customer per hour, keyed at
 * `<customer>/<yyyy>/<mm>/<dd>/<hh>.parquet`. R2 lifecycle (Sprint 8.6)
 * enforces 7-year retention.
 *
 * Pluggable uploader so unit tests can run end-to-end without R2.
 */
export interface AuditArchiveUploader {
  upload(key: string, body: Buffer): Promise<void>;
}

export interface AuditArchiveOptions {
  db: DrizzleClient;
  uploader: AuditArchiveUploader;
  /** Default 1h. */
  intervalMs?: number;
  /** Replaceable for tests. */
  now?: () => Date;
  logger: Logger;
}

export interface AuditArchiveWorker {
  start(): void;
  stop(): void;
  archiveHour(start: Date, end: Date): Promise<ArchiveResult>;
}

export interface ArchiveResult {
  /** Total rows archived across all customers in [start, end). */
  rows: number;
  /** Per-customer object keys uploaded. Useful for tests + logs. */
  uploaded: string[];
}

/** Parquet schema mirrors audit_events columns, JSON-encoding nested fields. */
const SCHEMA = new parquet.ParquetSchema({
  event_id: { type: 'UTF8' },
  customer_id: { type: 'UTF8' },
  ts: { type: 'TIMESTAMP_MILLIS' },
  agent: { type: 'UTF8' },
  decision: { type: 'UTF8' },
  command: { type: 'UTF8' },
  resource: { type: 'UTF8' }, // JSON-stringified
  context: { type: 'UTF8', optional: true }, // JSON-stringified, nullable
  prev_hash: { type: 'UTF8' },
  hash: { type: 'UTF8' },
});

export function createAuditArchiveWorker(opts: AuditArchiveOptions): AuditArchiveWorker {
  const intervalMs = opts.intervalMs ?? 60 * 60 * 1_000;
  const now = opts.now ?? (() => new Date());
  let timer: NodeJS.Timeout | undefined;

  async function archiveHour(start: Date, end: Date): Promise<ArchiveResult> {
    const rows = await opts.db.query.auditEvents.findMany({
      where: and(gte(schema.auditEvents.ts, start), lt(schema.auditEvents.ts, end)),
    });
    if (rows.length === 0) {
      return { rows: 0, uploaded: [] };
    }

    const byCustomer = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = byCustomer.get(row.customerId);
      if (list) list.push(row);
      else byCustomer.set(row.customerId, [row]);
    }

    const uploaded: string[] = [];
    for (const [customerId, customerRows] of byCustomer) {
      const buf = await rowsToParquet(customerRows);
      const key = objectKey(customerId, end);
      await opts.uploader.upload(key, buf);
      uploaded.push(key);
    }
    return { rows: rows.length, uploaded };
  }

  async function tick(): Promise<void> {
    const end = floorToHour(now());
    const start = new Date(end.getTime() - 60 * 60 * 1_000);
    try {
      const result = await archiveHour(start, end);
      opts.logger.info(
        { startIso: start.toISOString(), endIso: end.toISOString(), ...result },
        'audit hour archived',
      );
    } catch (err) {
      opts.logger.error({ err }, 'audit hour archive failed');
    }
  }

  return {
    archiveHour,
    start() {
      if (timer) return;
      timer = setInterval(() => {
        void tick();
      }, intervalMs);
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

interface ParquetRow {
  event_id: string;
  customer_id: string;
  ts: Date;
  agent: string;
  decision: string;
  command: string;
  resource: string;
  context: string | null;
  prev_hash: string;
  hash: string;
}

async function rowsToParquet(
  rows: ReadonlyArray<typeof schema.auditEvents.$inferSelect>,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  // ParquetWriter.openStream expects a WriteStreamMinimal — we only need
  // write() + end() to capture chunks in memory. The full fs.WriteStream
  // surface isn't needed at runtime.
  const sink = {
    write(chunk: Buffer, callback?: (err?: Error | null) => void) {
      chunks.push(Buffer.from(chunk));
      callback?.();
    },
    end(callback?: () => void) {
      callback?.();
    },
  };
  // biome-ignore lint/suspicious/noExplicitAny: parquetjs WriteStreamMinimal type is too narrow for in-memory sinks.
  const writer = await parquet.ParquetWriter.openStream(SCHEMA, sink as any);
  try {
    for (const row of rows) {
      const r: ParquetRow = {
        event_id: row.eventId,
        customer_id: row.customerId,
        ts: row.ts,
        agent: row.agent,
        decision: row.decision,
        command: row.command,
        resource: JSON.stringify(row.resource),
        context: row.context ? JSON.stringify(row.context) : null,
        prev_hash: row.prevHash,
        hash: row.hash,
      };
      await writer.appendRow(r as unknown as Record<string, unknown>);
    }
  } finally {
    await writer.close();
  }
  return Buffer.concat(chunks);
}

export function objectKey(customerId: string, hourEnd: Date): string {
  // Use the start of the hour for the path so the filename matches the data
  // window. hourEnd is the exclusive upper bound; subtract 1ms to be safe.
  const start = new Date(hourEnd.getTime() - 1);
  const yyyy = start.getUTCFullYear();
  const mm = String(start.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(start.getUTCDate()).padStart(2, '0');
  const hh = String(start.getUTCHours()).padStart(2, '0');
  return `${customerId}/${yyyy}/${mm}/${dd}/${hh}.parquet`;
}

export function floorToHour(d: Date): Date {
  const x = new Date(d);
  x.setUTCMinutes(0, 0, 0);
  return x;
}

/** R2 / S3-compatible uploader. */
export interface R2UploaderConfig {
  bucket: string;
  endpoint: string; // e.g. https://<account>.r2.cloudflarestorage.com
  accessKeyId: string;
  secretAccessKey: string;
  region?: string; // R2 ignores; defaults to 'auto'.
}

export function createR2Uploader(config: R2UploaderConfig): AuditArchiveUploader {
  const client = new S3Client({
    region: config.region ?? 'auto',
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return {
    async upload(key, body) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: body,
          ContentType: 'application/octet-stream',
        }),
      );
    },
  };
}
