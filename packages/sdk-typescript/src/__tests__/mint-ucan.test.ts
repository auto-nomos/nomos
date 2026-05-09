import { describe, expect, it, vi } from 'vitest';
import { createAuthGuard, MintUcanError } from '../auth-guard.js';

const VALID_KEY = 'cb_22222222-2222-2222-2222-222222222222_secret';
const PDP_URL = 'http://pdp.test';
const CP_URL = 'http://cp.test';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('AuthGuard.mintUcan', () => {
  it('POSTs to /v1/mint-ucan and caches results', async () => {
    const expiresAt = new Date(Date.now() + 600_000).toISOString();
    const fetchFn = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        ucans: [
          { command: '/github/issue/create', jwt: 'jwt-a', cid: 'cid-a', expiresAt },
          { command: '/github/repo/read', jwt: 'jwt-b', cid: 'cid-b', expiresAt },
        ],
      }),
    );
    const guard = createAuthGuard({
      apiKey: VALID_KEY,
      pdpUrl: PDP_URL,
      controlPlaneUrl: CP_URL,
      fetchFn,
    });
    const out = await guard.mintUcan({
      commands: ['/github/issue/create', '/github/repo/read'],
    });
    expect(out.size).toBe(2);
    expect(out.get('/github/issue/create')?.jwt).toBe('jwt-a');
    expect(out.get('/github/repo/read')?.cid).toBe('cid-b');

    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${CP_URL}/v1/mint-ucan`);
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as { commands: string[] };
    expect(body.commands).toEqual(['/github/issue/create', '/github/repo/read']);

    // Second call with same commands should hit the cache and not fetch.
    const cached = await guard.mintUcan({ commands: ['/github/issue/create'] });
    expect(cached.get('/github/issue/create')?.jwt).toBe('jwt-a');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('refreshes entries within 60s of expiry', async () => {
    const nearExpiry = new Date(Date.now() + 30_000).toISOString(); // 30s left
    const farExpiry = new Date(Date.now() + 600_000).toISOString();
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          ucans: [
            { command: '/github/repo/read', jwt: 'old', cid: 'cid-old', expiresAt: nearExpiry },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ucans: [
            { command: '/github/repo/read', jwt: 'new', cid: 'cid-new', expiresAt: farExpiry },
          ],
        }),
      );
    const guard = createAuthGuard({
      apiKey: VALID_KEY,
      pdpUrl: PDP_URL,
      controlPlaneUrl: CP_URL,
      fetchFn,
    });
    const first = await guard.mintUcan({ commands: ['/github/repo/read'] });
    expect(first.get('/github/repo/read')?.jwt).toBe('old');
    // Cached entry has < REFRESH_BEFORE_MS (60s) remaining → re-fetch.
    const second = await guard.mintUcan({ commands: ['/github/repo/read'] });
    expect(second.get('/github/repo/read')?.jwt).toBe('new');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('throws MintUcanError on 401', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ error: 'unauthorized', error_code: 'invalid_api_key' }, 401),
      );
    const guard = createAuthGuard({
      apiKey: VALID_KEY,
      pdpUrl: PDP_URL,
      controlPlaneUrl: CP_URL,
      fetchFn,
    });
    await expect(guard.mintUcan({ commands: ['/github/repo/read'] })).rejects.toMatchObject({
      name: 'MintUcanError',
      code: 'invalid_api_key',
      status: 401,
    });
  });

  it('throws MintUcanError on 409 ambiguous connector', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(
      jsonResponse(
        {
          error: 'multiple oauth connections for connector github',
          error_code: 'oauth_connection_ambiguous',
          connector: 'github',
        },
        409,
      ),
    );
    const guard = createAuthGuard({
      apiKey: VALID_KEY,
      pdpUrl: PDP_URL,
      controlPlaneUrl: CP_URL,
      fetchFn,
    });
    await expect(guard.mintUcan({ commands: ['/github/repo/read'] })).rejects.toBeInstanceOf(
      MintUcanError,
    );
  });

  it('throws when controlPlaneUrl was not configured', async () => {
    const fetchFn = vi.fn();
    const guard = createAuthGuard({ apiKey: VALID_KEY, pdpUrl: PDP_URL, fetchFn });
    await expect(guard.mintUcan({ commands: ['/github/repo/read'] })).rejects.toMatchObject({
      code: 'control_plane_url_missing',
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
