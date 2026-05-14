/**
 * OIDC issuer HTTP surface.
 *
 *   Public:
 *     GET /.well-known/openid-configuration  — discovery doc
 *     GET /oidc/jwks.json                    — JWKS (active + next + retired)
 *
 *   Internal (bearer-guarded, mounted under /v1/internal/oidc):
 *     POST /v1/internal/oidc/mint-id-token   — PDP-only mint endpoint
 *
 * The Cloudflare Worker at id.auto-nomos.com mirrors the public routes
 * with edge caching. The internal route stays on the control-plane.
 */

import type { JwtSigner } from '@auto-nomos/crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { internalAuth } from '../middleware/internal-auth.js';
import type { KeyStore } from '../oidc/key-store.js';
import { mintIdToken } from '../oidc/mint.js';
import type { RateLimiter } from '../oidc/rate-limit.js';

export interface OidcDeps {
  issuer: string;
  defaultTtlSeconds: number;
  keyStore: KeyStore;
  signer: JwtSigner;
  serviceToken: string;
  /** Per-agent rate limiter for the mint endpoint. Optional in tests. */
  rateLimiter?: RateLimiter;
}

const mintBody = z.object({
  customer_id: z.string().min(1),
  agent_id: z.string().min(1),
  audience: z.string().min(1),
  ttl_seconds: z.number().int().min(60).max(900).optional(),
  intent_id: z.string().optional(),
  ucan_cid: z.string().optional(),
});

export function createOidcRoutes(deps: OidcDeps): Hono {
  const app = new Hono();

  // ----- public discovery + JWKS -----

  app.get('/.well-known/openid-configuration', (c) => {
    return c.json({
      issuer: deps.issuer,
      jwks_uri: `${deps.issuer}/jwks.json`,
      response_types_supported: ['id_token'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      claims_supported: ['iss', 'sub', 'aud', 'iat', 'exp', 'nbf', 'jti'],
    });
  });

  app.get('/oidc/jwks.json', async (c) => {
    const keys = await deps.keyStore.getPublishedKeys();
    return c.json({
      keys: keys.map((k) => ({ ...k.publicJwk, alg: k.alg })),
    });
  });

  // ----- internal mint -----

  app.use('/v1/internal/oidc/*', internalAuth(deps.serviceToken));

  app.post('/v1/internal/oidc/mint-id-token', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }
    const parsed = mintBody.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400);
    }
    const { customer_id, agent_id, audience, ttl_seconds, intent_id, ucan_cid } = parsed.data;
    if (deps.rateLimiter && !deps.rateLimiter.tryAcquire(`${customer_id}/${agent_id}`)) {
      return c.json({ error: 'rate_limited' }, 429);
    }
    const active = await deps.keyStore.getActiveKey();
    if (active.kid !== deps.signer.kid) {
      return c.json({ error: 'signer_kid_mismatch' }, 500);
    }
    const result = await mintIdToken(deps.signer, deps.issuer, {
      customerId: customer_id,
      agentId: agent_id,
      audience,
      ttlSeconds: ttl_seconds ?? deps.defaultTtlSeconds,
      ...(intent_id ? { intentId: intent_id } : {}),
      ...(ucan_cid ? { ucanCid: ucan_cid } : {}),
    });
    return c.json({
      token: result.token,
      kid: result.kid,
      jti: result.jti,
      sub: result.sub,
      expires_at: result.expiresAt.toISOString(),
    });
  });

  return app;
}
