import { pino } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import type { Db } from '../db/index.js';
import { createHealthRoutes } from '../routes/health.js';
import { createServer } from '../server.js';

const logger = pino({ level: 'silent' });

function fakeDb(query: () => Promise<{ rows: { ok: number }[] }>): Db {
  return {
    query,
    end: async () => undefined,
  } as unknown as Db;
}

describe('health routes', () => {
  it('GET /healthz returns 200 ok', async () => {
    const app = createServer({
      logger,
      db: fakeDb(async () => ({ rows: [{ ok: 1 }] })),
    });
    const res = await app.request('/healthz');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; ts: number };
    expect(body.ok).toBe(true);
    expect(typeof body.ts).toBe('number');
  });

  it('GET /readyz returns 200 when db ping succeeds', async () => {
    const app = createServer({
      logger,
      db: fakeDb(async () => ({ rows: [{ ok: 1 }] })),
    });
    const res = await app.request('/readyz');
    expect(res.status).toBe(200);
  });

  it('GET /readyz returns 503 when db ping throws', async () => {
    const app = createServer({
      logger,
      db: fakeDb(async () => {
        throw new Error('connection refused');
      }),
    });
    const res = await app.request('/readyz');
    expect(res.status).toBe(503);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('db_unavailable');
  });

  it('GET /readyz returns 503 when db ping returns unexpected shape', async () => {
    const app = createServer({
      logger,
      db: fakeDb(async () => ({ rows: [] })),
    });
    const res = await app.request('/readyz');
    expect(res.status).toBe(503);
  });

  it('createHealthRoutes can be mounted independently', () => {
    const router = createHealthRoutes({
      db: fakeDb(async () => ({ rows: [{ ok: 1 }] })),
    });
    expect(router).toBeDefined();
    expect(typeof router.fetch).toBe('function');
    void vi; // keep import to avoid TS unused warning
  });
});
