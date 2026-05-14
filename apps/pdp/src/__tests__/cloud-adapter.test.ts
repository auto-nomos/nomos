import { describe, expect, it, vi } from 'vitest';
import { CloudCallError, cloudApiCall } from '../adapters/cloud.js';

const CP_URL = 'http://control-plane.test';
const TOKEN = 'svc';

describe('cloudApiCall', () => {
  it('POSTs to control-plane api-call and returns parsed response', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(`${CP_URL}/v1/internal/cloud/api-call/conn-1`);
      const headers = init?.headers as Record<string, string>;
      expect(headers.authorization).toBe(`Bearer ${TOKEN}`);
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      expect(body.customer_id).toBe('c');
      expect(body.agent_id).toBe('a');
      expect((body.request as Record<string, unknown>).url).toBe('/x');
      return new Response(
        JSON.stringify({
          status: 200,
          body: { ok: true },
          headers: { 'content-type': 'application/json' },
          id_token_jti: 'jti-1',
          connector: 'azure',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const result = await cloudApiCall(
      { controlPlaneUrl: CP_URL, serviceToken: TOKEN, fetch: fetchMock },
      'conn-1',
      { customerId: 'c', agentId: 'a' },
      { method: 'GET', url: '/x' },
    );
    expect(result.status).toBe(200);
    expect(result.idTokenJti).toBe('jti-1');
    expect(result.connector).toBe('azure');
  });

  it('throws CloudCallError on 503 with retryable=true', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: 'cloud_call_failed',
            message: 'aad throttled',
            providerStatus: 429,
            retryable: true,
          }),
          { status: 503, headers: { 'content-type': 'application/json' } },
        ),
    ) as unknown as typeof fetch;
    try {
      await cloudApiCall(
        { controlPlaneUrl: CP_URL, serviceToken: TOKEN, fetch: fetchMock },
        'conn-1',
        { customerId: 'c', agentId: 'a' },
        { method: 'GET', url: '/x' },
      );
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(CloudCallError);
      const e = err as CloudCallError;
      expect(e.retryable).toBe(true);
      expect(e.providerStatus).toBe(429);
    }
  });

  it('forwards parent_receipt_id / swarm_id / chain_depth into the request body', async () => {
    let captured: Record<string, unknown> = {};
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      captured = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          status: 200,
          body: { ok: true },
          headers: {},
          id_token_jti: 'jti-2',
          connector: 'aws',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;
    await cloudApiCall(
      { controlPlaneUrl: CP_URL, serviceToken: TOKEN, fetch: fetchMock },
      'conn-2',
      {
        customerId: 'c',
        agentId: 'a',
        parentReceiptId: 'parent-receipt-hex',
        swarmId: '00000000-0000-0000-0000-0000000000aa',
        chainDepth: 2,
      },
      { method: 'GET', url: '/x' },
    );
    expect(captured.parent_receipt_id).toBe('parent-receipt-hex');
    expect(captured.swarm_id).toBe('00000000-0000-0000-0000-0000000000aa');
    expect(captured.chain_depth).toBe(2);
  });

  it('throws plain Error on 502', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: 'cloud_call_failed',
            message: 'invalid_client',
            providerStatus: 401,
            retryable: false,
          }),
          { status: 502, headers: { 'content-type': 'application/json' } },
        ),
    ) as unknown as typeof fetch;
    try {
      await cloudApiCall(
        { controlPlaneUrl: CP_URL, serviceToken: TOKEN, fetch: fetchMock },
        'conn-1',
        { customerId: 'c', agentId: 'a' },
        { method: 'GET', url: '/x' },
      );
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(CloudCallError);
      expect((err as CloudCallError).retryable).toBe(false);
    }
  });
});
