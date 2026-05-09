import type { AddressInfo } from 'node:net';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAuthGuard } from '../auth-guard.js';

const VALID_KEY = 'cb_11111111-1111-1111-1111-111111111111_secrettoken';
const CUSTOMER_ID = '11111111-1111-1111-1111-111111111111';

interface ServerHandle {
  url: string;
  close: () => Promise<void>;
  authorizeHits: Array<{ headers: Record<string, string>; body: unknown }>;
  receiptHits: Array<{ headers: Record<string, string>; body: unknown }>;
  setAuthorizeBehaviour: (
    fn: (req: { body: unknown }) => { status: number; body: unknown },
  ) => void;
}

async function bootMockPdp(): Promise<ServerHandle> {
  const handle: ServerHandle = {
    url: '',
    close: async () => {},
    authorizeHits: [],
    receiptHits: [],
    setAuthorizeBehaviour: () => {},
  };

  let authorizeFn: (req: { body: unknown }) => { status: number; body: unknown } = () => ({
    status: 200,
    body: { allow: true, receiptId: 'r-mock' },
  });
  handle.setAuthorizeBehaviour = (fn) => {
    authorizeFn = fn;
  };

  const app = new Hono();
  app.post('/v1/authorize', async (c) => {
    const body = await c.req.json();
    handle.authorizeHits.push({ headers: c.req.header(), body });
    const out = authorizeFn({ body });
    return c.json(out.body as object, out.status as 200 | 500);
  });
  app.post('/v1/receipts', async (c) => {
    const body = await c.req.json();
    handle.receiptHits.push({ headers: c.req.header(), body });
    return c.json({ ok: true }, 200);
  });

  const server = serve({ fetch: app.fetch, port: 0 });
  await new Promise<void>((resolve) => {
    server.once('listening', () => resolve());
  });
  const addr = server.address() as AddressInfo;
  handle.url = `http://127.0.0.1:${addr.port}`;
  handle.close = () =>
    new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  return handle;
}

describe('SDK integration (real HTTP)', () => {
  let pdp: ServerHandle;
  beforeEach(async () => {
    pdp = await bootMockPdp();
  });
  afterEach(async () => {
    await pdp.close();
  });

  it('authorize round-trips over real HTTP', async () => {
    const guard = createAuthGuard({ apiKey: VALID_KEY, pdpUrl: pdp.url });
    const decision = await guard.authorize({
      ucan: 'eyJ.fake.ucan',
      command: '/github/issue/create',
      resource: { repo: 'acme/billing' },
      context: {},
    });
    expect(decision.allow).toBe(true);
    expect(decision.receiptId).toBe('r-mock');

    expect(pdp.authorizeHits).toHaveLength(1);
    const hit = pdp.authorizeHits[0]!;
    expect(hit.headers['x-cb-customer']).toBe(CUSTOMER_ID);
    expect(hit.headers.authorization).toBe(`Bearer ${VALID_KEY}`);
    expect(hit.headers['content-type']).toContain('application/json');
    expect(hit.body).toMatchObject({
      command: '/github/issue/create',
      resource: { repo: 'acme/billing' },
    });
  });

  it('emitReceipt round-trips over real HTTP', async () => {
    const guard = createAuthGuard({ apiKey: VALID_KEY, pdpUrl: pdp.url });
    await guard.emitReceipt('r-mock', { outcome: 'success', metadata: { issueId: 7 } });
    expect(pdp.receiptHits).toHaveLength(1);
    const hit = pdp.receiptHits[0]!;
    expect(hit.body).toMatchObject({
      receiptId: 'r-mock',
      outcome: 'success',
      metadata: { issueId: 7 },
    });
    expect(hit.headers['x-cb-customer']).toBe(CUSTOMER_ID);
  });

  it('fail-closed: PDP 500 → deny without throwing', async () => {
    pdp.setAuthorizeBehaviour(() => ({ status: 500, body: { error: 'boom' } }));
    const guard = createAuthGuard({
      apiKey: VALID_KEY,
      pdpUrl: pdp.url,
      retry: { maxAttempts: 2, baseDelayMs: 1 },
    });
    const decision = await guard.authorize({
      ucan: 'x',
      command: '/x',
      resource: {},
      context: {},
    });
    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe('pdp_unreachable');
  });

  it('fail-open: PDP 500 → allow', async () => {
    pdp.setAuthorizeBehaviour(() => ({ status: 500, body: { error: 'boom' } }));
    const guard = createAuthGuard({
      apiKey: VALID_KEY,
      pdpUrl: pdp.url,
      failureMode: 'open',
      retry: { maxAttempts: 2, baseDelayMs: 1 },
    });
    const decision = await guard.authorize({
      ucan: 'x',
      command: '/x',
      resource: {},
      context: {},
    });
    expect(decision.allow).toBe(true);
    expect(decision.reason).toBe('pdp_unreachable_failopen');
  });

  it('fail-closed: PDP unreachable URL → deny', async () => {
    const closedUrl = pdp.url;
    await pdp.close();
    const guard = createAuthGuard({
      apiKey: VALID_KEY,
      pdpUrl: closedUrl,
      retry: { maxAttempts: 2, baseDelayMs: 1 },
    });
    const decision = await guard.authorize({
      ucan: 'x',
      command: '/x',
      resource: {},
      context: {},
    });
    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe('pdp_unreachable');
    pdp = await bootMockPdp(); // restore for afterEach
  });
});
