import type pg from 'pg';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import type { Auth } from '../auth/index.js';
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

const stubAuth: Auth = {
  handler: async () => new Response(JSON.stringify({ stub: true }), { status: 200 }),
} as unknown as Auth;

describe('server', () => {
  it('responds 404 with not_found JSON on unknown path', async () => {
    const app = createServer({ logger, db: okDb, auth: stubAuth });
    const res = await app.request('/no-such');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('not_found');
  });

  it('attaches x-request-id header on every response', async () => {
    const app = createServer({ logger, db: okDb, auth: stubAuth });
    const res = await app.request('/healthz');
    expect(res.headers.get('x-request-id')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('echoes incoming x-request-id', async () => {
    const app = createServer({ logger, db: okDb, auth: stubAuth });
    const res = await app.request('/healthz', { headers: { 'x-request-id': 'abc123' } });
    expect(res.headers.get('x-request-id')).toBe('abc123');
  });

  it('sets secure-headers on responses', async () => {
    const app = createServer({ logger, db: okDb, auth: stubAuth });
    const res = await app.request('/healthz');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('routes /auth/* to the Better-Auth handler', async () => {
    const calls: string[] = [];
    const auth: Auth = {
      handler: async (req: Request) => {
        calls.push(req.url);
        return new Response(JSON.stringify({ routed: true }), { status: 200 });
      },
    } as unknown as Auth;
    const app = createServer({ logger, db: okDb, auth });
    const res = await app.request('/auth/sign-in/email', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('/auth/sign-in/email');
  });
});
