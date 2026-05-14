import { describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../worker.js';

const env: Env = {
  CONTROL_PLANE_PUBLIC_URL: 'http://control-plane.test',
  JWKS_EDGE_CACHE_TTL: '60',
  DISCOVERY_EDGE_CACHE_TTL: '120',
};

describe('oidc-issuer worker', () => {
  it('returns discovery document', async () => {
    const res = await worker.fetch(
      new Request('https://id.auto-nomos.com/.well-known/openid-configuration'),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.issuer).toBe('https://id.auto-nomos.com');
    expect(body.jwks_uri).toBe('https://id.auto-nomos.com/jwks.json');
    expect(body.id_token_signing_alg_values_supported).toEqual(['RS256']);
    expect(res.headers.get('cache-control')).toContain('max-age=120');
  });

  it('proxies jwks.json from the control-plane', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ keys: [{ kid: 'k1', kty: 'RSA' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const res = await worker.fetch(new Request('https://id.auto-nomos.com/jwks.json'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { keys: Array<{ kid: string }> };
    expect(body.keys[0]?.kid).toBe('k1');
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://control-plane.test/oidc/jwks.json',
      expect.any(Object),
    );
    expect(res.headers.get('cache-control')).toContain('max-age=60');
    fetchSpy.mockRestore();
  });

  it('returns 502 when upstream JWKS is unavailable', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('boom', { status: 500 }));
    const res = await worker.fetch(new Request('https://id.auto-nomos.com/jwks.json'), env);
    expect(res.status).toBe(502);
    fetchSpy.mockRestore();
  });

  it('returns 404 for unknown paths', async () => {
    const res = await worker.fetch(new Request('https://id.auto-nomos.com/anything'), env);
    expect(res.status).toBe(404);
  });

  it('returns 405 for non-GET methods', async () => {
    const res = await worker.fetch(
      new Request('https://id.auto-nomos.com/.well-known/openid-configuration', {
        method: 'POST',
      }),
      env,
    );
    expect(res.status).toBe(405);
  });

  it('returns ok at /healthz', async () => {
    const res = await worker.fetch(new Request('https://id.auto-nomos.com/healthz'), env);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });
});
