import { describe, expect, it } from 'vitest';
import {
  ConnectorAuthError,
  type ConnectorContext,
  expiresInToDate,
  parseScopeString,
  postFormToTokenEndpoint,
} from '../../oauth/connector.js';

function makeCtx(fetchImpl: typeof fetch): ConnectorContext {
  return {
    fetch: fetchImpl,
    clientId: 'cid',
    clientSecret: 'sec',
    redirectUri: 'https://app.test/cb',
  };
}

describe('parseScopeString', () => {
  it('splits space-delimited scopes', () => {
    expect(parseScopeString('repo read:user')).toEqual(['read:user', 'repo']);
  });

  it('splits comma-delimited scopes (slack)', () => {
    expect(parseScopeString('chat:write,channels:read,users:read')).toEqual([
      'channels:read',
      'chat:write',
      'users:read',
    ]);
  });

  it('de-duplicates and sorts', () => {
    expect(parseScopeString('repo repo read:user')).toEqual(['read:user', 'repo']);
  });

  it('returns [] for non-string input', () => {
    expect(parseScopeString(null)).toEqual([]);
    expect(parseScopeString(undefined)).toEqual([]);
    expect(parseScopeString(42)).toEqual([]);
  });

  it('returns [] for empty string', () => {
    expect(parseScopeString('')).toEqual([]);
  });
});

describe('expiresInToDate', () => {
  it('converts seconds to Date relative to provided now', () => {
    const now = new Date('2026-05-09T10:00:00Z');
    expect(expiresInToDate(3600, now)?.toISOString()).toBe('2026-05-09T11:00:00.000Z');
  });

  it('returns null for non-positive / non-number / NaN / Infinity', () => {
    expect(expiresInToDate(0)).toBeNull();
    expect(expiresInToDate(-1)).toBeNull();
    expect(expiresInToDate('abc')).toBeNull();
    expect(expiresInToDate(undefined)).toBeNull();
    expect(expiresInToDate(Number.NaN)).toBeNull();
    expect(expiresInToDate(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('postFormToTokenEndpoint', () => {
  it('serializes form-encoded body and parses JSON response', async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    const f: typeof fetch = async (url, init) => {
      captured = { url: String(url), init: (init ?? {}) as RequestInit };
      return new Response(JSON.stringify({ access_token: 'tok', scope: 'repo' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const parsed = await postFormToTokenEndpoint(makeCtx(f), 'https://t.test/token', {
      grant_type: 'authorization_code',
      code: 'abc',
    });
    expect(parsed).toEqual({ access_token: 'tok', scope: 'repo' });
    expect(captured?.init.method).toBe('POST');
    expect((captured?.init.headers as Record<string, string>)['content-type']).toBe(
      'application/x-www-form-urlencoded',
    );
    expect(captured?.init.body).toBe('grant_type=authorization_code&code=abc');
  });

  it('adds Basic auth header when basicAuth: true', async () => {
    let header = '';
    const f: typeof fetch = async (_, init) => {
      header = (init?.headers as Record<string, string>).authorization ?? '';
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    };
    await postFormToTokenEndpoint(
      makeCtx(f),
      'https://t.test/token',
      { code: 'x' },
      {
        basicAuth: true,
      },
    );
    expect(header).toBe(`Basic ${Buffer.from('cid:sec').toString('base64')}`);
  });

  it('throws ConnectorAuthError on non-2xx', async () => {
    const f: typeof fetch = async () =>
      new Response(JSON.stringify({ error: 'bad_code' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    await expect(
      postFormToTokenEndpoint(makeCtx(f), 'https://t.test/token', { code: 'x' }),
    ).rejects.toMatchObject({
      name: 'ConnectorAuthError',
      status: 400,
    });
  });

  it('throws on non-JSON response', async () => {
    const f: typeof fetch = async () => new Response('<html>500</html>', { status: 200 });
    await expect(
      postFormToTokenEndpoint(makeCtx(f), 'https://t.test/token', { code: 'x' }),
    ).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('parses extra headers including notion-version', async () => {
    let headers = {} as Record<string, string>;
    const f: typeof fetch = async (_, init) => {
      headers = init?.headers as Record<string, string>;
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    };
    await postFormToTokenEndpoint(
      makeCtx(f),
      'https://t.test/token',
      { code: 'x' },
      { headers: { 'notion-version': '2022-06-28' } },
    );
    expect(headers['notion-version']).toBe('2022-06-28');
  });
});
