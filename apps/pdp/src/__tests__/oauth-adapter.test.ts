import { describe, expect, it } from 'vitest';
import {
  isKnownProvider,
  PROVIDER_API,
  type ProxyRequest,
  proxyApiCall,
} from '../adapters/oauth.js';

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

describe('PROVIDER_API', () => {
  it('covers all implemented providers', () => {
    expect(Object.keys(PROVIDER_API).sort()).toEqual([
      'discord',
      'github',
      'google',
      'linear',
      'notion',
      'slack',
      'stripe',
    ]);
  });
});

describe('isKnownProvider', () => {
  it('accepts every implemented provider', () => {
    expect(isKnownProvider('github')).toBe(true);
    expect(isKnownProvider('slack')).toBe(true);
    expect(isKnownProvider('google')).toBe(true);
    expect(isKnownProvider('notion')).toBe(true);
    expect(isKnownProvider('linear')).toBe(true);
    expect(isKnownProvider('stripe')).toBe(true);
  });
  it('rejects everything else', () => {
    expect(isKnownProvider('salesforce')).toBe(false);
    expect(isKnownProvider('')).toBe(false);
  });
});

describe('proxyApiCall — github', () => {
  it('GET sends bearer token + github headers and parses JSON', async () => {
    const { fetch: f, calls } = makeFetch({
      'https://api.github.com/repos/acme/repo': () =>
        new Response(JSON.stringify({ name: 'repo' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    const res = await proxyApiCall(
      'github',
      'gho_abc',
      { method: 'GET', path: '/repos/acme/repo' },
      { fetch: f },
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: 'repo' });
    expect(calls[0].init.headers.authorization).toBe('Bearer gho_abc');
    expect(calls[0].init.headers['x-github-api-version']).toBe('2022-11-28');
    expect(calls[0].init.headers['user-agent']).toBe('credential-broker-pdp');
  });

  it('POST encodes body as JSON and surfaces 4xx as-is', async () => {
    const { fetch: f, calls } = makeFetch({
      'https://api.github.com/repos/acme/repo/issues': () =>
        new Response(JSON.stringify({ message: 'validation failed' }), {
          status: 422,
          headers: { 'content-type': 'application/json' },
        }),
    });
    const res = await proxyApiCall(
      'github',
      'gho_abc',
      { method: 'POST', path: '/repos/acme/repo/issues', body: { title: 'hi' } },
      { fetch: f },
    );
    expect(res.status).toBe(422);
    expect(calls[0].init.body).toBe('{"title":"hi"}');
  });
});

describe('proxyApiCall — slack content-type', () => {
  it('sends `application/json; charset=utf-8` per slack convention', async () => {
    const { fetch: f, calls } = makeFetch({
      'https://slack.com/api/chat.postMessage': () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    await proxyApiCall(
      'slack',
      'xoxb',
      { method: 'POST', path: '/chat.postMessage', body: { channel: 'C', text: 'hi' } },
      { fetch: f },
    );
    expect(calls[0].init.headers['content-type']).toBe('application/json; charset=utf-8');
  });
});

describe('proxyApiCall — notion adds Notion-Version', () => {
  it('includes notion-version header', async () => {
    const { fetch: f, calls } = makeFetch({
      'https://api.notion.com/v1/pages': () =>
        new Response(JSON.stringify({ object: 'page' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    await proxyApiCall('notion', 'secret_x', { method: 'GET', path: '/pages' }, { fetch: f });
    expect(calls[0].init.headers['notion-version']).toBe('2022-06-28');
  });
});

describe('proxyApiCall — google query params', () => {
  it('appends query params to the URL', async () => {
    const { fetch: f, calls } = makeFetch({
      'https://www.googleapis.com/drive/v3/files': () =>
        new Response(JSON.stringify({ files: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    const req: ProxyRequest = {
      method: 'GET',
      path: '/drive/v3/files',
      query: { pageSize: '50' },
    };
    await proxyApiCall('google', 'ya29.x', req, { fetch: f });
    expect(calls[0].url).toContain('pageSize=50');
  });
});

describe('proxyApiCall — non-JSON body fallback', () => {
  it('returns text body when content-type is not json', async () => {
    const { fetch: f } = makeFetch({
      'https://api.github.com/zen': () =>
        new Response('Approachable is better than simple.', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        }),
    });
    const res = await proxyApiCall(
      'github',
      'gho_abc',
      { method: 'GET', path: '/zen' },
      { fetch: f },
    );
    expect(res.body).toBe('Approachable is better than simple.');
  });

  it('falls back to text when json content-type lies', async () => {
    const { fetch: f } = makeFetch({
      'https://api.github.com/repos/x/y': () =>
        new Response('<html>bad gateway</html>', {
          status: 502,
          headers: { 'content-type': 'application/json' },
        }),
    });
    const res = await proxyApiCall(
      'github',
      'gho_abc',
      { method: 'GET', path: '/repos/x/y' },
      { fetch: f },
    );
    expect(res.status).toBe(502);
    expect(res.body).toBe('<html>bad gateway</html>');
  });
});
