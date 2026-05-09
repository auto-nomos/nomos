import { describe, expect, it, vi } from 'vitest';
import { createAuthGuard } from '../auth-guard.js';

const VALID_KEY = 'cb_11111111-1111-1111-1111-111111111111_secrettoken123';
const CUSTOMER_ID = '11111111-1111-1111-1111-111111111111';
const PDP_URL = 'http://pdp.test';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const allowBody = {
  allow: true,
  receiptId: 'r-1',
};
const denyBody = {
  allow: false,
  reason: 'policy_denied',
  receiptId: 'r-2',
};

describe('createAuthGuard', () => {
  it('rejects invalid api key at construction', () => {
    expect(() => createAuthGuard({ apiKey: 'bad', pdpUrl: PDP_URL })).toThrow(/api key/i);
  });

  describe('authorize', () => {
    it('sends POST /v1/authorize with correct headers + body', async () => {
      const fetchFn = vi.fn().mockResolvedValueOnce(jsonResponse(allowBody));
      const guard = createAuthGuard({ apiKey: VALID_KEY, pdpUrl: PDP_URL, fetchFn });
      const decision = await guard.authorize({
        ucan: 'eyJ...',
        command: '/github/issue/create',
        resource: { repo: 'acme/billing' },
        context: {},
      });
      expect(decision.allow).toBe(true);
      expect(decision.receiptId).toBe('r-1');
      expect(fetchFn).toHaveBeenCalledTimes(1);
      const [url, init] = fetchFn.mock.calls[0]!;
      expect(url).toBe(`${PDP_URL}/v1/authorize`);
      expect(init.method).toBe('POST');
      const headers = init.headers as Record<string, string>;
      expect(headers['content-type']).toBe('application/json');
      expect(headers['x-cb-customer']).toBe(CUSTOMER_ID);
      expect(headers.authorization).toBe(`Bearer ${VALID_KEY}`);
      const body = JSON.parse(init.body as string);
      expect(body.command).toBe('/github/issue/create');
      expect(body.resource.repo).toBe('acme/billing');
    });

    it('returns deny decision unchanged from PDP', async () => {
      const fetchFn = vi.fn().mockResolvedValueOnce(jsonResponse(denyBody));
      const guard = createAuthGuard({ apiKey: VALID_KEY, pdpUrl: PDP_URL, fetchFn });
      const decision = await guard.authorize({
        ucan: 'eyJ...',
        command: '/github/issue/create',
        resource: {},
        context: {},
      });
      expect(decision.allow).toBe(false);
      expect(decision.reason).toBe('policy_denied');
    });

    it('strips trailing slash on pdpUrl', async () => {
      const fetchFn = vi.fn().mockResolvedValueOnce(jsonResponse(allowBody));
      const guard = createAuthGuard({
        apiKey: VALID_KEY,
        pdpUrl: `${PDP_URL}/`,
        fetchFn,
      });
      await guard.authorize({ ucan: 'x', command: '/x', resource: {}, context: {} });
      expect(fetchFn.mock.calls[0]![0]).toBe(`${PDP_URL}/v1/authorize`);
    });

    describe('failureMode = closed (default)', () => {
      it('denies on persistent 5xx', async () => {
        const fetchFn = vi.fn().mockResolvedValue(jsonResponse({}, 503));
        const guard = createAuthGuard({
          apiKey: VALID_KEY,
          pdpUrl: PDP_URL,
          fetchFn,
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

      it('denies on network error', async () => {
        const fetchFn = vi.fn().mockRejectedValue(new TypeError('net'));
        const guard = createAuthGuard({
          apiKey: VALID_KEY,
          pdpUrl: PDP_URL,
          fetchFn,
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

      it('denies on malformed JSON response', async () => {
        const fetchFn = vi.fn().mockResolvedValueOnce(
          new Response('not json', {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
        const guard = createAuthGuard({ apiKey: VALID_KEY, pdpUrl: PDP_URL, fetchFn });
        const decision = await guard.authorize({
          ucan: 'x',
          command: '/x',
          resource: {},
          context: {},
        });
        expect(decision.allow).toBe(false);
        expect(decision.reason).toBe('pdp_invalid_response');
      });
    });

    describe('failureMode = open', () => {
      it('allows on persistent 5xx', async () => {
        const fetchFn = vi.fn().mockResolvedValue(jsonResponse({}, 503));
        const guard = createAuthGuard({
          apiKey: VALID_KEY,
          pdpUrl: PDP_URL,
          fetchFn,
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
    });
  });

  describe('emitReceipt', () => {
    it('POSTs /v1/receipts', async () => {
      const fetchFn = vi.fn().mockResolvedValueOnce(jsonResponse({ ok: true }));
      const guard = createAuthGuard({ apiKey: VALID_KEY, pdpUrl: PDP_URL, fetchFn });
      await guard.emitReceipt('r-1', { outcome: 'success', metadata: { issueId: 42 } });
      const [url, init] = fetchFn.mock.calls[0]!;
      expect(url).toBe(`${PDP_URL}/v1/receipts`);
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body as string);
      expect(body.receiptId).toBe('r-1');
      expect(body.outcome).toBe('success');
      expect(body.metadata.issueId).toBe(42);
    });

    it('throws if PDP returns non-2xx', async () => {
      const fetchFn = vi.fn().mockResolvedValueOnce(jsonResponse({ error: 'no' }, 400));
      const guard = createAuthGuard({ apiKey: VALID_KEY, pdpUrl: PDP_URL, fetchFn });
      await expect(guard.emitReceipt('r-1', { outcome: 'success' })).rejects.toThrow(/receipt/i);
    });
  });
});
