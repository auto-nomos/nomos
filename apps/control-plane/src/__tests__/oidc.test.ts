/**
 * Pure unit test for the OIDC issuer surface — no DB, no Better-Auth.
 * Mounts the route module against an in-memory StaticKeyStore and a
 * test RSA key, then exercises:
 *
 *   - GET /.well-known/openid-configuration
 *   - GET /oidc/jwks.json
 *   - POST /v1/internal/oidc/mint-id-token (auth + happy path + bad input)
 *
 * Verifies the minted token against the published JWK end-to-end.
 */
import { generateKeyPairSync } from 'node:crypto';
import { LocalRs256Signer, publicJwkFromPrivatePem, verifyJwtRs256 } from '@auto-nomos/crypto';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { StaticKeyStore } from '../oidc/key-store.js';
import { mintIdToken } from '../oidc/mint.js';
import { createTokenBucketRateLimiter } from '../oidc/rate-limit.js';
import { createOidcRoutes } from '../routes/oidc.js';

const TOKEN = 'test-service-token';
const ISSUER = 'http://localhost:8788/oidc';

function fixture() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
  const kid = 'test-kid-1';
  const signer = new LocalRs256Signer({ kid, privateKeyPem });
  const publicJwk = publicJwkFromPrivatePem({ kid, privateKeyPem });
  const keyStore = new StaticKeyStore({ kid, publicJwk });
  const app = new Hono();
  app.route(
    '/',
    createOidcRoutes({
      issuer: ISSUER,
      defaultTtlSeconds: 300,
      keyStore,
      signer,
      serviceToken: TOKEN,
    }),
  );
  return { app, publicJwk, kid };
}

describe('OIDC issuer routes', () => {
  it('GET /.well-known/openid-configuration returns discovery doc', async () => {
    const { app } = fixture();
    const res = await app.request('/.well-known/openid-configuration');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.issuer).toBe(ISSUER);
    expect(body.jwks_uri).toBe(`${ISSUER}/jwks.json`);
    expect(body.id_token_signing_alg_values_supported).toEqual(['RS256']);
  });

  it('GET /oidc/jwks.json returns the active public key', async () => {
    const { app, kid } = fixture();
    const res = await app.request('/oidc/jwks.json');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { keys: Array<{ kid: string; alg: string; kty: string }> };
    expect(body.keys).toHaveLength(1);
    expect(body.keys[0]?.kid).toBe(kid);
    expect(body.keys[0]?.alg).toBe('RS256');
    expect(body.keys[0]?.kty).toBe('RSA');
  });

  describe('POST /v1/internal/oidc/mint-id-token', () => {
    it('rejects requests without the service token', async () => {
      const { app } = fixture();
      const res = await app.request('/v1/internal/oidc/mint-id-token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customer_id: 'c1', agent_id: 'a1', audience: 'aud' }),
      });
      expect(res.status).toBe(401);
    });

    it('rejects invalid bodies', async () => {
      const { app } = fixture();
      const res = await app.request('/v1/internal/oidc/mint-id-token', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify({ customer_id: 'c1' }),
      });
      expect(res.status).toBe(400);
    });

    it('mints a valid token that verifies against the published JWK', async () => {
      const { app, publicJwk } = fixture();
      const res = await app.request('/v1/internal/oidc/mint-id-token', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify({
          customer_id: 'cust-abc',
          agent_id: 'agent-xyz',
          audience: 'api://AzureADTokenExchange',
          intent_id: 'intent-1',
          ucan_cid: 'bafy-fake-cid',
          ttl_seconds: 120,
        }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        token: string;
        kid: string;
        jti: string;
        sub: string;
        expires_at: string;
      };
      expect(body.kid).toBe(publicJwk.kid);
      expect(body.sub).toBe('customer/cust-abc/agent/agent-xyz');
      const payload = verifyJwtRs256(body.token, publicJwk) as Record<string, unknown>;
      expect(payload.iss).toBe(ISSUER);
      expect(payload.aud).toBe('api://AzureADTokenExchange');
      expect(payload.sub).toBe('customer/cust-abc/agent/agent-xyz');
      const nomos = payload.nomos as Record<string, unknown>;
      expect(nomos.customer_id).toBe('cust-abc');
      expect(nomos.agent_id).toBe('agent-xyz');
      expect(nomos.intent_id).toBe('intent-1');
      expect(nomos.ucan_cid).toBe('bafy-fake-cid');
    });

    it('uses default TTL when ttl_seconds omitted', async () => {
      const { app, publicJwk } = fixture();
      const res = await app.request('/v1/internal/oidc/mint-id-token', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify({
          customer_id: 'c1',
          agent_id: 'a1',
          audience: 'sts.amazonaws.com',
        }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { token: string };
      const payload = verifyJwtRs256(body.token, publicJwk) as Record<string, number>;
      const ttl = (payload.exp as number) - (payload.iat as number);
      expect(ttl).toBe(300);
    });
  });

  describe('rate limit', () => {
    it('returns 429 after burst exhausted, recovers after refill', async () => {
      const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
      const signer = new LocalRs256Signer({ kid: 'rl-kid', privateKeyPem });
      const publicJwk = publicJwkFromPrivatePem({ kid: 'rl-kid', privateKeyPem });
      const keyStore = new StaticKeyStore({ kid: 'rl-kid', publicJwk });
      let now = 1_700_000_000_000;
      const rateLimiter = createTokenBucketRateLimiter({
        ratePerMinute: 60,
        burst: 2,
        now: () => now,
      });
      const app = new Hono();
      app.route(
        '/',
        createOidcRoutes({
          issuer: ISSUER,
          defaultTtlSeconds: 300,
          keyStore,
          signer,
          serviceToken: TOKEN,
          rateLimiter,
        }),
      );
      const body = JSON.stringify({
        customer_id: 'c1',
        agent_id: 'a1',
        audience: 'sts.amazonaws.com',
      });
      const headers = {
        'content-type': 'application/json',
        authorization: `Bearer ${TOKEN}`,
      };
      // burst=2 — first two allowed, third 429.
      expect(
        (await app.request('/v1/internal/oidc/mint-id-token', { method: 'POST', headers, body }))
          .status,
      ).toBe(200);
      expect(
        (await app.request('/v1/internal/oidc/mint-id-token', { method: 'POST', headers, body }))
          .status,
      ).toBe(200);
      expect(
        (await app.request('/v1/internal/oidc/mint-id-token', { method: 'POST', headers, body }))
          .status,
      ).toBe(429);
      // Refill: 1 token/sec at 60/min. Advance 2s → 2 tokens back.
      now += 2_000;
      expect(
        (await app.request('/v1/internal/oidc/mint-id-token', { method: 'POST', headers, body }))
          .status,
      ).toBe(200);
    });
  });

  describe('mintIdToken (pure)', () => {
    it('rejects TTLs outside [60, 900]', async () => {
      const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
      const signer = new LocalRs256Signer({ kid: 'k', privateKeyPem });
      await expect(
        mintIdToken(signer, ISSUER, {
          customerId: 'c',
          agentId: 'a',
          audience: 'x',
          ttlSeconds: 30,
        }),
      ).rejects.toThrow(/out of bounds/);
      await expect(
        mintIdToken(signer, ISSUER, {
          customerId: 'c',
          agentId: 'a',
          audience: 'x',
          ttlSeconds: 1200,
        }),
      ).rejects.toThrow(/out of bounds/);
    });
  });
});
