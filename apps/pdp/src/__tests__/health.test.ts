import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { createPolicyCache } from '../cache/policies.js';
import { createRevocationCache } from '../cache/revocations.js';
import { createServer } from '../server.js';

function buildTestServer() {
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
  return createServer({ logger, policyCache, revocationCache });
}

describe('health routes', () => {
  it('GET /healthz returns 200 with ok=true', async () => {
    const app = buildTestServer();
    const res = await app.request('/healthz');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('GET /readyz returns 200 with ok=true', async () => {
    const app = buildTestServer();
    const res = await app.request('/readyz');
    expect(res.status).toBe(200);
  });

  it('GET /unknown returns 404', async () => {
    const app = buildTestServer();
    const res = await app.request('/unknown');
    expect(res.status).toBe(404);
  });

  it('responds with x-request-id header (preserves incoming)', async () => {
    const app = buildTestServer();
    const res = await app.request('/healthz', {
      headers: { 'x-request-id': 'test-id-123' },
    });
    expect(res.headers.get('x-request-id')).toBe('test-id-123');
  });

  it('responds with auto-generated x-request-id when not provided', async () => {
    const app = buildTestServer();
    const res = await app.request('/healthz');
    expect(res.headers.get('x-request-id')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('404 response body includes request_id matching the header', async () => {
    const app = buildTestServer();
    const res = await app.request('/no-such-path', {
      headers: { 'x-request-id': 'rid-404-test' },
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string; request_id: string };
    expect(body.error).toBe('not_found');
    expect(body.request_id).toBe('rid-404-test');
    expect(res.headers.get('x-request-id')).toBe('rid-404-test');
  });
});
