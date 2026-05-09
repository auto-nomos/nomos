import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { createRevocationPublisher } from '../services/revocation-publisher.js';

const logger = pino({ level: 'silent' });
const SERVICE_TOKEN = 'dev-shared-token';

function fakeOk(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function fake5xx(): Response {
  return new Response('boom', { status: 500 });
}

describe('createRevocationPublisher', () => {
  it('returns 0/0 when no webhook urls configured', async () => {
    const fetchSpy = vi.fn(async () => fakeOk());
    const pub = createRevocationPublisher({
      webhookUrls: [],
      serviceToken: SERVICE_TOKEN,
      logger,
      fetch: fetchSpy as unknown as typeof fetch,
    });
    const result = await pub.publish('cust-1', 'cid-1');
    expect(result).toEqual({ succeeded: 0, failed: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('POSTs to every webhook with bearer + body', async () => {
    const fetchSpy = vi.fn(async () => fakeOk());
    const pub = createRevocationPublisher({
      webhookUrls: ['http://pdp-a/v1/internal/refresh-revocations', 'http://pdp-b/_revoke'],
      serviceToken: SERVICE_TOKEN,
      logger,
      fetch: fetchSpy as unknown as typeof fetch,
    });
    const result = await pub.publish('cust-1', 'cid-1');
    expect(result).toEqual({ succeeded: 2, failed: 0 });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe('http://pdp-a/v1/internal/refresh-revocations');
    const body = JSON.parse((init as { body: string }).body);
    expect(body).toEqual({ customer_id: 'cust-1', cid: 'cid-1' });
    const headers = (init as { headers: Record<string, string> }).headers;
    expect(headers.authorization).toBe(`Bearer ${SERVICE_TOKEN}`);
    expect(headers['content-type']).toBe('application/json');
  });

  it('counts non-2xx as failed but does not throw', async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce(fakeOk()).mockResolvedValueOnce(fake5xx());
    const pub = createRevocationPublisher({
      webhookUrls: ['http://pdp-a/_', 'http://pdp-b/_'],
      serviceToken: SERVICE_TOKEN,
      logger,
      fetch: fetchSpy as unknown as typeof fetch,
    });
    const result = await pub.publish('cust-1', 'cid-1');
    expect(result).toEqual({ succeeded: 1, failed: 1 });
  });

  it('counts thrown fetches as failed but does not throw', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(fakeOk())
      .mockRejectedValueOnce(new Error('network'));
    const pub = createRevocationPublisher({
      webhookUrls: ['http://pdp-a/_', 'http://pdp-b/_'],
      serviceToken: SERVICE_TOKEN,
      logger,
      fetch: fetchSpy as unknown as typeof fetch,
    });
    const result = await pub.publish('cust-1', 'cid-1');
    expect(result).toEqual({ succeeded: 1, failed: 1 });
  });

  it('aborts on timeout (counts as failed)', async () => {
    // fetch hangs forever
    const fetchSpy = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const pub = createRevocationPublisher({
      webhookUrls: ['http://pdp-a/_'],
      serviceToken: SERVICE_TOKEN,
      logger,
      fetch: fetchSpy as unknown as typeof fetch,
      timeoutMs: 5,
    });
    const result = await pub.publish('cust-1', 'cid-1');
    expect(result).toEqual({ succeeded: 0, failed: 1 });
  });
});
