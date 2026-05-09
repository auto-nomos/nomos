import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPolicyCache } from '../cache/policies.js';
import { createRevocationCache } from '../cache/revocations.js';
import { createServer } from '../server.js';

const SERVICE_TOKEN = 'dev-shared-token';

function buildServer(opts: {
  fetchRevocations?: (customerId: string) => Promise<Iterable<string> | undefined>;
}) {
  const logger = pino({ level: 'silent' });
  const policyCache = createPolicyCache({
    fetchBundle: async () => undefined,
    refreshIntervalMs: 60_000,
    logger,
  });
  const revocationCache = createRevocationCache({
    fetchRevocations: opts.fetchRevocations ?? (async () => undefined),
    refreshIntervalMs: 60_000,
    logger,
  });
  const app = createServer({
    logger,
    policyCache,
    revocationCache,
    internal: { serviceToken: SERVICE_TOKEN },
  });
  return { app, revocationCache };
}

describe('POST /v1/internal/refresh-revocations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('401 without bearer token', async () => {
    const { app } = buildServer({});
    const res = await app.request('/v1/internal/refresh-revocations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ customer_id: 'cust-1' }),
    });
    expect(res.status).toBe(401);
  });

  it('401 with wrong token', async () => {
    const { app } = buildServer({});
    const res = await app.request('/v1/internal/refresh-revocations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer nope' },
      body: JSON.stringify({ customer_id: 'cust-1' }),
    });
    expect(res.status).toBe(401);
  });

  it('400 when customer_id missing', async () => {
    const { app } = buildServer({});
    const res = await app.request('/v1/internal/refresh-revocations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${SERVICE_TOKEN}` },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('400 when body is not JSON', async () => {
    const { app } = buildServer({});
    const res = await app.request('/v1/internal/refresh-revocations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${SERVICE_TOKEN}` },
      body: 'not-json',
    });
    expect(res.status).toBe(400);
  });

  it('200 refreshes that customer immediately', async () => {
    const fetchSpy = vi.fn(async () => ['fresh-1']);
    const { app, revocationCache } = buildServer({ fetchRevocations: fetchSpy });
    revocationCache.set('cust-1', ['old']);
    const res = await app.request('/v1/internal/refresh-revocations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${SERVICE_TOKEN}` },
      body: JSON.stringify({ customer_id: 'cust-1' }),
    });
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledWith('cust-1');
    expect(revocationCache.getRevoked('cust-1').has('fresh-1')).toBe(true);
    expect(revocationCache.getRevoked('cust-1').has('old')).toBe(false);
  });

  it('keeps stale revocations when fetch throws (still returns 200)', async () => {
    const { app, revocationCache } = buildServer({
      fetchRevocations: async () => {
        throw new Error('upstream down');
      },
    });
    revocationCache.set('cust-1', ['cid-1']);
    const res = await app.request('/v1/internal/refresh-revocations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${SERVICE_TOKEN}` },
      body: JSON.stringify({ customer_id: 'cust-1' }),
    });
    // The cache swallows fetch errors and serves stale, so we still 200.
    expect(res.status).toBe(200);
    expect(revocationCache.getRevoked('cust-1').has('cid-1')).toBe(true);
  });

  it('not mounted when internal deps omitted', async () => {
    const logger = pino({ level: 'silent' });
    const policyCache = createPolicyCache({
      fetchBundle: async () => undefined,
      refreshIntervalMs: 60_000,
      logger,
    });
    const revocationCache = createRevocationCache({
      fetchRevocations: async () => undefined,
      refreshIntervalMs: 60_000,
      logger,
    });
    const app = createServer({ logger, policyCache, revocationCache });
    const res = await app.request('/v1/internal/refresh-revocations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${SERVICE_TOKEN}` },
      body: JSON.stringify({ customer_id: 'cust-1' }),
    });
    expect(res.status).toBe(404);
  });
});
