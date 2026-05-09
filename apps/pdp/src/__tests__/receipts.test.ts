import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { createPolicyCache } from '../cache/policies.js';
import { createRevocationCache } from '../cache/revocations.js';
import { createServer } from '../server.js';

const CUSTOMER = '550e8400-e29b-41d4-a716-446655440000';

function buildApp(opts: { emitReceipt?: ReturnType<typeof vi.fn> } = {}) {
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
  const emitReceipt = opts.emitReceipt ?? vi.fn().mockResolvedValue(undefined);
  const app = createServer({ logger, policyCache, revocationCache, emitReceipt });
  return { app, emitReceipt };
}

describe('POST /v1/receipts', () => {
  it('records valid receipt and returns 200', async () => {
    const { app, emitReceipt } = buildApp();
    const res = await app.request('/v1/receipts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': CUSTOMER },
      body: JSON.stringify({
        receiptId: 'r-1',
        outcome: 'success',
        metadata: { issueId: 42 },
      }),
    });
    expect(res.status).toBe(200);
    expect(emitReceipt).toHaveBeenCalledTimes(1);
    const arg = emitReceipt.mock.calls[0]![0];
    expect(arg.customerId).toBe(CUSTOMER);
    expect(arg.receiptId).toBe('r-1');
    expect(arg.outcome).toBe('success');
    expect(arg.metadata).toEqual({ issueId: 42 });
    expect(typeof arg.ts).toBe('number');
  });

  it('rejects missing customer header → 400', async () => {
    const { app } = buildApp();
    const res = await app.request('/v1/receipts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ receiptId: 'r-1', outcome: 'success' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects malformed JSON → 400', async () => {
    const { app } = buildApp();
    const res = await app.request('/v1/receipts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': CUSTOMER },
      body: 'not json',
    });
    expect(res.status).toBe(400);
  });

  it('rejects invalid shape (missing receiptId) → 400', async () => {
    const { app } = buildApp();
    const res = await app.request('/v1/receipts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': CUSTOMER },
      body: JSON.stringify({ outcome: 'success' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects invalid outcome → 400', async () => {
    const { app } = buildApp();
    const res = await app.request('/v1/receipts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': CUSTOMER },
      body: JSON.stringify({ receiptId: 'r-1', outcome: 'meh' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 503 when emitReceipt not configured', async () => {
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
    const res = await app.request('/v1/receipts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': CUSTOMER },
      body: JSON.stringify({ receiptId: 'r-1', outcome: 'success' }),
    });
    expect(res.status).toBe(503);
  });
});
