import type pg from 'pg';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import type { Db, DrizzleClient } from '../db/index.js';
import { createServer } from '../server.js';

const logger = pino({ level: 'silent' });

const okDb: Db = {
  pool: {
    query: async () => ({ rows: [{ ok: 1 }] }),
    end: async () => undefined,
  } as unknown as pg.Pool,
  drizzle: {} as DrizzleClient,
};

describe('server', () => {
  it('responds 404 with not_found JSON on unknown path', async () => {
    const app = createServer({ logger, db: okDb });
    const res = await app.request('/no-such');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('not_found');
  });

  it('attaches x-request-id header on every response', async () => {
    const app = createServer({ logger, db: okDb });
    const res = await app.request('/healthz');
    expect(res.headers.get('x-request-id')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('echoes incoming x-request-id', async () => {
    const app = createServer({ logger, db: okDb });
    const res = await app.request('/healthz', { headers: { 'x-request-id': 'abc123' } });
    expect(res.headers.get('x-request-id')).toBe('abc123');
  });

  it('sets secure-headers on responses', async () => {
    const app = createServer({ logger, db: okDb });
    const res = await app.request('/healthz');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
