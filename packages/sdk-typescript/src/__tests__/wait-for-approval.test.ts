import { describe, expect, it, vi } from 'vitest';
import { createAuthGuard } from '../auth-guard.js';

const VALID_KEY = 'cb_11111111-1111-1111-1111-111111111111_secrettoken123';
const PDP_URL = 'http://pdp.test';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('waitForApproval', () => {
  it('returns approved + cosignerJwt as soon as state flips', async () => {
    const calls: number[] = [];
    const fetchFn = vi.fn(async () => {
      calls.push(Date.now());
      if (calls.length < 3) {
        return jsonResponse({
          id: 'aprv-1',
          state: 'pending',
          command: '/stripe/charge',
          resource: { amount: 250 },
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          decidedAt: null,
          cosignerJwt: null,
        });
      }
      return jsonResponse({
        id: 'aprv-1',
        state: 'approved',
        command: '/stripe/charge',
        resource: { amount: 250 },
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        decidedAt: new Date().toISOString(),
        cosignerJwt: 'eyCosignerJwt',
      });
    });
    const guard = createAuthGuard({ apiKey: VALID_KEY, pdpUrl: PDP_URL, fetchFn });
    const status = await guard.waitForApproval({
      stepUpId: 'aprv-1',
      pollIntervalMs: 5,
      timeoutMs: 1_000,
    });
    expect(status.state).toBe('approved');
    expect(status.cosignerJwt).toBe('eyCosignerJwt');
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('returns denied as soon as state flips', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({
        id: 'aprv-2',
        state: 'denied',
        command: '/x/y',
        resource: {},
        expiresAt: new Date().toISOString(),
        decidedAt: new Date().toISOString(),
        cosignerJwt: null,
      }),
    );
    const guard = createAuthGuard({ apiKey: VALID_KEY, pdpUrl: PDP_URL, fetchFn });
    const status = await guard.waitForApproval({
      stepUpId: 'aprv-2',
      pollIntervalMs: 5,
      timeoutMs: 1_000,
    });
    expect(status.state).toBe('denied');
    expect(status.cosignerJwt).toBeNull();
  });

  it('returns expired when 404', async () => {
    const fetchFn = vi.fn(async () => new Response('not found', { status: 404 }));
    const guard = createAuthGuard({ apiKey: VALID_KEY, pdpUrl: PDP_URL, fetchFn });
    const status = await guard.waitForApproval({
      stepUpId: 'gone',
      pollIntervalMs: 5,
      timeoutMs: 1_000,
    });
    expect(status.state).toBe('expired');
  });

  it('expires when timeout elapses without resolution', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({
        id: 'aprv-3',
        state: 'pending',
        command: '/x/y',
        resource: {},
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        decidedAt: null,
        cosignerJwt: null,
      }),
    );
    const guard = createAuthGuard({ apiKey: VALID_KEY, pdpUrl: PDP_URL, fetchFn });
    const status = await guard.waitForApproval({
      stepUpId: 'aprv-3',
      pollIntervalMs: 5,
      timeoutMs: 30,
    });
    expect(status.state).toBe('expired');
    expect(fetchFn.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('sends x-cb-customer + bearer headers on every poll', async () => {
    let captured: Record<string, string> = {};
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) => {
      captured = init.headers as Record<string, string>;
      return jsonResponse({
        id: 'aprv-4',
        state: 'approved',
        command: '/x/y',
        resource: {},
        expiresAt: new Date().toISOString(),
        decidedAt: new Date().toISOString(),
        cosignerJwt: 'jwt',
      });
    });
    const guard = createAuthGuard({ apiKey: VALID_KEY, pdpUrl: PDP_URL, fetchFn });
    await guard.waitForApproval({ stepUpId: 'aprv-4', pollIntervalMs: 5, timeoutMs: 1_000 });
    expect(captured.authorization).toMatch(/^Bearer /);
    expect(captured['x-cb-customer']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
