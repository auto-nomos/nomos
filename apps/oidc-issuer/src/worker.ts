/**
 * Nomos OIDC issuer — Cloudflare Worker.
 *
 * Public surface served at id.auto-nomos.com:
 *
 *   GET /.well-known/openid-configuration
 *   GET /jwks.json                  (proxied to control-plane /oidc/jwks.json)
 *
 * No signing happens here — control-plane mints tokens internally. The
 * Worker exists to (1) terminate at the edge for DDoS posture, (2)
 * provide a stable issuer URL distinct from the control-plane's host,
 * and (3) edge-cache so JWKS lookups by AWS STS / Azure AD / GCP STS
 * don't hammer the control-plane.
 */

export interface Env {
  CONTROL_PLANE_PUBLIC_URL: string;
  JWKS_EDGE_CACHE_TTL: string;
  DISCOVERY_EDGE_CACHE_TTL: string;
}

const ISSUER = 'https://id.auto-nomos.com';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== 'GET') {
      return jsonError(405, 'method_not_allowed');
    }

    if (url.pathname === '/.well-known/openid-configuration') {
      return discovery(env);
    }
    if (url.pathname === '/jwks.json') {
      return proxyJwks(env);
    }
    if (url.pathname === '/healthz') {
      return new Response('ok', { status: 200 });
    }
    return jsonError(404, 'not_found');
  },
};

function discovery(env: Env): Response {
  const body = {
    issuer: ISSUER,
    jwks_uri: `${ISSUER}/jwks.json`,
    response_types_supported: ['id_token'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    claims_supported: ['iss', 'sub', 'aud', 'iat', 'exp', 'nbf', 'jti'],
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=${parseTtl(env.DISCOVERY_EDGE_CACHE_TTL, 3600)}`,
      'access-control-allow-origin': '*',
    },
  });
}

async function proxyJwks(env: Env): Promise<Response> {
  const upstreamUrl = `${env.CONTROL_PLANE_PUBLIC_URL}/oidc/jwks.json`;
  // Use Cloudflare's `cf` properties to populate the edge cache automatically.
  // The browser/STS-side cache header below is independent of the edge cache.
  const cacheTtl = parseTtl(env.JWKS_EDGE_CACHE_TTL, 300);
  const upstream = await fetch(upstreamUrl, {
    cf: { cacheTtl, cacheEverything: true },
    // Force GET, no client headers.
  });
  if (!upstream.ok) {
    return jsonError(502, 'jwks_upstream_unavailable');
  }
  const body = await upstream.text();
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=${cacheTtl}`,
      'access-control-allow-origin': '*',
    },
  });
}

function parseTtl(raw: string | undefined, fallback: number): number {
  const n = Number(raw ?? '');
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
