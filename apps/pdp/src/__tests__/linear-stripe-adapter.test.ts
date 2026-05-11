import { describe, expect, it } from 'vitest';
import { proxyApiCall } from '../adapters/oauth.js';

interface CapturedCall {
  url: string;
  init: { method?: string; headers: Record<string, string>; body?: string };
}

function makeFetch(map: Record<string, () => Response>): {
  fetch: typeof fetch;
  calls: CapturedCall[];
} {
  const calls: CapturedCall[] = [];
  const f: typeof fetch = async (url, init) => {
    const u = String(url);
    calls.push({
      url: u,
      init: {
        method: init?.method,
        headers: (init?.headers as Record<string, string>) ?? {},
        body: typeof init?.body === 'string' ? init.body : undefined,
      },
    });
    const handler =
      Object.entries(map).find(([prefix]) => u.startsWith(prefix))?.[1] ??
      (() => new Response('not mocked', { status: 599 }));
    return handler();
  };
  return { fetch: f, calls };
}

describe('proxyApiCall — linear', () => {
  it('POST /graphql sends bearer + JSON body, parses JSON', async () => {
    const { fetch: f, calls } = makeFetch({
      'https://api.linear.app/graphql': () =>
        new Response(JSON.stringify({ data: { issues: { nodes: [] } } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    const res = await proxyApiCall(
      'linear',
      'lin_oauth_abc',
      {
        method: 'POST',
        path: '/graphql',
        body: { query: '{ issues { nodes { id } } }' },
      },
      { fetch: f },
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { issues: { nodes: [] } } });
    expect(calls[0]?.init.headers.authorization).toBe('Bearer lin_oauth_abc');
    expect(calls[0]?.init.headers['content-type']).toBe('application/json');
    expect(calls[0]?.init.body).toContain('issues');
  });
});

describe('proxyApiCall — stripe', () => {
  it('POST sends form-encoded body with bracket notation', async () => {
    const { fetch: f, calls } = makeFetch({
      'https://api.stripe.com/v1/customers': () =>
        new Response(JSON.stringify({ id: 'cus_abc' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    const res = await proxyApiCall(
      'stripe',
      'sk_test_xyz',
      {
        method: 'POST',
        path: '/v1/customers',
        body: { email: 'a@b.com', metadata: { tier: 'pro' } },
      },
      { fetch: f },
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'cus_abc' });
    expect(calls[0]?.init.headers.authorization).toBe('Bearer sk_test_xyz');
    expect(calls[0]?.init.headers['content-type']).toBe('application/x-www-form-urlencoded');
    const body = calls[0]?.init.body ?? '';
    expect(body).toContain('email=a%40b.com');
    expect(body).toContain('metadata%5Btier%5D=pro');
  });

  it('GET passes query params + auth header, no body', async () => {
    const { fetch: f, calls } = makeFetch({
      'https://api.stripe.com/v1/customers': () =>
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    const res = await proxyApiCall(
      'stripe',
      'sk_test_xyz',
      { method: 'GET', path: '/v1/customers', query: { limit: '10' } },
      { fetch: f },
    );
    expect(res.status).toBe(200);
    expect(calls[0]?.url).toContain('limit=10');
    expect(calls[0]?.init.body).toBeUndefined();
  });
});
