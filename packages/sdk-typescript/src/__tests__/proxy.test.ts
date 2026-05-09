import { describe, expect, it, vi } from 'vitest';
import { createAuthGuard } from '../auth-guard.js';

const VALID_KEY = 'cb_22222222-2222-2222-2222-222222222222_secret';
const PDP_URL = 'http://pdp.test';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('AuthGuard.proxy', () => {
  it('POSTs to /v1/proxy<command> and parses upstream block on allow', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        allow: true,
        decision: { allow: true, receiptId: 'r-1' },
        upstream: { status: 201, body: { number: 7 }, headers: { etag: 'abc' } },
        connector: 'github',
      }),
    );
    const guard = createAuthGuard({ apiKey: VALID_KEY, pdpUrl: PDP_URL, fetchFn });
    const result = await guard.proxy({
      ucan: 'eyJ...',
      command: '/github/issue/create',
      resource: { repo: 'acme/billing' },
      context: {},
      apiCall: { method: 'POST', path: '/repos/acme/billing/issues', body: { title: 'hi' } },
    });
    expect(result.allow).toBe(true);
    expect(result.upstream?.status).toBe(201);
    expect(result.connector).toBe('github');
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${PDP_URL}/v1/proxy/github/issue/create`);
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.ucan).toBe('eyJ...');
    expect(body.apiCall).toEqual({
      method: 'POST',
      path: '/repos/acme/billing/issues',
      body: { title: 'hi' },
    });
    expect(body.request).toMatchObject({ command: '/github/issue/create' });
  });

  it('passes through deny decision (no upstream block)', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(
      jsonResponse(
        {
          allow: false,
          decision: { allow: false, reason: 'policy_denied', receiptId: 'r-d' },
        },
        403,
      ),
    );
    const guard = createAuthGuard({ apiKey: VALID_KEY, pdpUrl: PDP_URL, fetchFn });
    const result = await guard.proxy({
      ucan: 'eyJ...',
      command: '/github/issue/create',
      resource: { repo: 'acme/payroll' },
      context: {},
      apiCall: { method: 'POST', path: '/repos/acme/payroll/issues' },
    });
    expect(result.allow).toBe(false);
    expect(result.decision.reason).toBe('policy_denied');
    expect(result.upstream).toBeUndefined();
  });

  it('falls back to fail-closed decision when PDP returns 5xx', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(new Response('boom', { status: 503 }));
    const guard = createAuthGuard({ apiKey: VALID_KEY, pdpUrl: PDP_URL, fetchFn });
    const result = await guard.proxy({
      ucan: 'eyJ...',
      command: '/github/issue/create',
      resource: {},
      context: {},
      apiCall: { method: 'GET', path: '/repos/x/y' },
    });
    expect(result.allow).toBe(false);
    expect(result.decision.reason).toBe('pdp_unreachable');
    expect(result.upstream).toBeUndefined();
  });

  it('falls back to fail-open when configured', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(new Response('boom', { status: 503 }));
    const guard = createAuthGuard({
      apiKey: VALID_KEY,
      pdpUrl: PDP_URL,
      fetchFn,
      failureMode: 'open',
    });
    const result = await guard.proxy({
      ucan: 'eyJ...',
      command: '/github/issue/create',
      resource: {},
      context: {},
      apiCall: { method: 'GET', path: '/repos/x/y' },
    });
    expect(result.allow).toBe(true);
    expect(result.decision.reason).toBe('pdp_unreachable_failopen');
  });

  it('returns invalid_response decision on malformed PDP body', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(new Response('not-json', { status: 200 }));
    const guard = createAuthGuard({ apiKey: VALID_KEY, pdpUrl: PDP_URL, fetchFn });
    const result = await guard.proxy({
      ucan: 'eyJ...',
      command: '/github/issue/create',
      resource: {},
      context: {},
      apiCall: { method: 'GET', path: '/x' },
    });
    expect(result.allow).toBe(false);
    expect(result.decision.reason).toBe('pdp_invalid_response');
  });

  it('returns invalid_response decision when PDP body lacks decision field', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(jsonResponse({ allow: true }));
    const guard = createAuthGuard({ apiKey: VALID_KEY, pdpUrl: PDP_URL, fetchFn });
    const result = await guard.proxy({
      ucan: 'eyJ...',
      command: '/github/issue/create',
      resource: {},
      context: {},
      apiCall: { method: 'GET', path: '/x' },
    });
    expect(result.decision.reason).toBe('pdp_invalid_response');
  });

  it('falls back to fail-closed on network error', async () => {
    const fetchFn = vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const guard = createAuthGuard({ apiKey: VALID_KEY, pdpUrl: PDP_URL, fetchFn });
    const result = await guard.proxy({
      ucan: 'eyJ...',
      command: '/github/issue/create',
      resource: {},
      context: {},
      apiCall: { method: 'GET', path: '/x' },
    });
    expect(result.allow).toBe(false);
    expect(result.decision.reason).toBe('pdp_unreachable');
  });
});
