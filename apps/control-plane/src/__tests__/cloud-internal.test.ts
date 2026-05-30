/**
 * Pure unit tests for /v1/internal/cloud/api-call.
 *
 * No DB. Uses an in-process loadCloudConnection stub via a fake Db
 * (drizzle is heavy to stand up in tests; we instead exercise the wired
 * route via the standard fake-DB pattern).
 *
 * Mocks AAD + ARM at the fetch boundary; asserts the full pipeline:
 * mint → exchange → ARM call → response back to the caller.
 */
import { generateKeyPairSync } from 'node:crypto';
import type { CloudConnectorId, CloudProvider } from '@auto-nomos/core';
import { LocalRs256Signer, publicJwkFromPrivatePem, verifyJwtRs256 } from '@auto-nomos/crypto';
import { Hono } from 'hono';
import { pino } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import type { CloudConnectionRow } from '../cloud/connections.js';
import { AzureCloudProvider } from '../cloud/providers/azure.js';
import { loggerMiddleware } from '../middleware/logger.js';
import { createCloudInternalRoutes } from '../routes/cloud-internal.js';

const ISSUER = 'http://localhost:8788/oidc';
const SERVICE_TOKEN = 'svc-token';
// Prod mounts loggerMiddleware globally (server.ts: app.use('*', ...)), so error
// paths can call getLog(). Tests mount routes on a bare Hono — attach a silent
// logger so the federation-error path doesn't throw "logger not attached".
const silentLog = pino({ level: 'silent' });

function fixture(): {
  app: Hono;
  publicJwk: ReturnType<typeof publicJwkFromPrivatePem>;
  fetchMock: ReturnType<typeof vi.fn>;
  loadedToken: { value: string | null };
} {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
  const kid = 'test-kid';
  const signer = new LocalRs256Signer({ kid, privateKeyPem });
  const publicJwk = publicJwkFromPrivatePem({ kid, privateKeyPem });
  const loadedToken: { value: string | null } = { value: null };

  // fetch mock — first call goes to AAD, second to ARM.
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.startsWith('https://aad.test/')) {
      const body = String(init?.body ?? '');
      const assertionMatch = body.match(/client_assertion=([^&]+)/);
      if (assertionMatch?.[1]) {
        loadedToken.value = decodeURIComponent(assertionMatch[1]);
      }
      return new Response(JSON.stringify({ access_token: 'aad-token-xyz', expires_in: 3600 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (u.startsWith('https://arm.test/')) {
      return new Response(JSON.stringify({ value: [{ name: 'rg-1' }, { name: 'rg-2' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('unexpected', { status: 500 });
  }) as unknown as typeof fetch;

  const azure = new AzureCloudProvider({
    fetch: fetchMock,
    aadHost: 'https://aad.test',
    armHost: 'https://arm.test',
  });
  const registry = new Map<CloudConnectorId, CloudProvider>([['azure', azure]]);

  const connection: CloudConnectionRow = {
    id: 'conn-uuid',
    customerId: 'cust-uuid',
    connector: 'azure',
    accountId: 'sub-uuid',
    tenantId: 'tenant-uuid',
    externalId: 'app-object-id',
    config: { app_client_id: 'client-id-abc' },
    displayName: 'test',
    bootstrapStatus: 'verified',
    lastVerifiedAt: null,
    lastVerifyError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const fakeDb = makeFakeDb(connection);

  const app = new Hono();
  app.route(
    '/',
    createCloudInternalRoutes({
      db: fakeDb,
      serviceToken: SERVICE_TOKEN,
      issuer: ISSUER,
      signer,
      defaultTtlSeconds: 300,
      registry,
    }),
  );
  return { app, publicJwk, fetchMock, loadedToken };
}

function makeFakeDb(connection: CloudConnectionRow): import('../db/index.js').Db {
  // We import the loadCloudConnection module-level function via dependency
  // injection: createCloudInternalRoutes calls `loadCloudConnection(deps.db, ...)`
  // which uses drizzle. For a unit test we mock the drizzle select by
  // returning a minimal shape that the helper unwraps. Easier path: spy
  // on the helper.
  // Instead — drizzle has a `select().from(...).where(...).limit(1)` shape.
  // Build a tiny chain that resolves to [row] when the customerId matches.
  const chain = {
    from() {
      return this;
    },
    where(_predicate: unknown) {
      return this;
    },
    async limit(_n: number) {
      return [
        {
          id: connection.id,
          customerId: connection.customerId,
          connector: connection.connector,
          accountId: connection.accountId,
          tenantId: connection.tenantId,
          externalId: connection.externalId,
          displayName: connection.displayName,
          config: connection.config,
          bootstrapStatus: connection.bootstrapStatus,
          lastVerifiedAt: connection.lastVerifiedAt,
          lastVerifyError: connection.lastVerifyError,
          createdAt: connection.createdAt,
          updatedAt: connection.updatedAt,
        },
      ];
    },
  };
  const drizzle = {
    select() {
      return chain;
    },
  } as unknown as { select: () => typeof chain };
  return { drizzle, pool: {} as never };
}

describe('POST /v1/internal/cloud/api-call', () => {
  it('mints → exchanges → calls ARM end-to-end', async () => {
    const { app, publicJwk, loadedToken } = fixture();
    const res = await app.request('/v1/internal/cloud/api-call/conn-uuid', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${SERVICE_TOKEN}`,
      },
      body: JSON.stringify({
        customer_id: 'cust-uuid',
        agent_id: 'agent-uuid',
        intent_id: 'intent-xyz',
        request: {
          method: 'GET',
          url: '/subscriptions/sub-uuid/resourcegroups',
          query: { 'api-version': '2021-04-01' },
        },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: number;
      body: { value: Array<{ name: string }> };
      headers: Record<string, string>;
      id_token_jti: string;
      connector: string;
    };
    expect(body.status).toBe(200);
    expect(body.body.value[0]?.name).toBe('rg-1');
    expect(body.body.value[1]?.name).toBe('rg-2');
    expect(body.connector).toBe('azure');
    expect(typeof body.id_token_jti).toBe('string');

    // The ID token AAD received should verify against the issuer JWK and
    // carry the Nomos namespace claims.
    expect(loadedToken.value).not.toBeNull();
    const payload = verifyJwtRs256(loadedToken.value as string, publicJwk) as Record<
      string,
      unknown
    >;
    expect(payload.iss).toBe(ISSUER);
    expect(payload.aud).toBe('api://AzureADTokenExchange');
    expect(payload.sub).toBe('customer/cust-uuid/agent/agent-uuid');
    expect((payload.nomos as Record<string, unknown>).intent_id).toBe('intent-xyz');
  });

  it('rejects requests without service token', async () => {
    const { app } = fixture();
    const res = await app.request('/v1/internal/cloud/api-call/conn-uuid', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        customer_id: 'c',
        agent_id: 'a',
        request: { method: 'GET', url: '/x' },
      }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 502 on AAD non-retryable failure', async () => {
    // Override the AAD fetch to return 400.
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    const signer = new LocalRs256Signer({ kid: 'k', privateKeyPem });
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      if (String(url).startsWith('https://aad.test/')) {
        return new Response(JSON.stringify({ error: 'invalid_client' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('nope', { status: 500 });
    }) as unknown as typeof fetch;
    const azure = new AzureCloudProvider({
      fetch: fetchMock,
      aadHost: 'https://aad.test',
      armHost: 'https://arm.test',
    });
    const registry = new Map<CloudConnectorId, CloudProvider>([['azure', azure]]);
    const connection: CloudConnectionRow = {
      id: 'c',
      customerId: 'cust',
      connector: 'azure',
      accountId: 'sub',
      tenantId: 'tenant',
      externalId: 'ext',
      config: { app_client_id: 'cid' },
      displayName: null,
      bootstrapStatus: 'pending',
      lastVerifiedAt: null,
      lastVerifyError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const app = new Hono();
    app.use('*', loggerMiddleware(silentLog));
    app.route(
      '/',
      createCloudInternalRoutes({
        db: makeFakeDb(connection),
        serviceToken: SERVICE_TOKEN,
        issuer: ISSUER,
        signer,
        defaultTtlSeconds: 300,
        registry,
      }),
    );
    const res = await app.request('/v1/internal/cloud/api-call/c', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${SERVICE_TOKEN}` },
      body: JSON.stringify({
        customer_id: 'cust',
        agent_id: 'a',
        request: { method: 'GET', url: '/x' },
      }),
    });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string; retryable: boolean };
    expect(body.error).toBe('cloud_call_failed');
    expect(body.retryable).toBe(false);
  });

  it('forwards parent_receipt_id / swarm_id / chain_depth into auditPublisher.publish', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    const signer = new LocalRs256Signer({ kid: 'k', privateKeyPem });
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      if (String(url).startsWith('https://aad.test/')) {
        return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    const azure = new AzureCloudProvider({
      fetch: fetchMock,
      aadHost: 'https://aad.test',
      armHost: 'https://arm.test',
    });
    const registry = new Map<CloudConnectorId, CloudProvider>([['azure', azure]]);
    const connection: CloudConnectionRow = {
      id: 'c',
      customerId: 'cust',
      connector: 'azure',
      accountId: 'sub',
      tenantId: 'tenant',
      externalId: 'ext',
      config: { app_client_id: 'cid' },
      displayName: null,
      bootstrapStatus: 'verified',
      lastVerifiedAt: null,
      lastVerifyError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const captured: Array<Record<string, unknown>> = [];
    const auditPublisher = {
      publish: async (input: Record<string, unknown>) => {
        captured.push(input);
      },
    };
    const app = new Hono();
    app.use('*', loggerMiddleware(silentLog));
    app.route(
      '/',
      createCloudInternalRoutes({
        db: makeFakeDb(connection),
        serviceToken: SERVICE_TOKEN,
        issuer: ISSUER,
        signer,
        defaultTtlSeconds: 300,
        registry,
        auditPublisher,
      }),
    );
    const res = await app.request('/v1/internal/cloud/api-call/c', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${SERVICE_TOKEN}` },
      body: JSON.stringify({
        customer_id: 'cust',
        agent_id: 'a',
        parent_receipt_id: 'parent-hex',
        swarm_id: '00000000-0000-0000-0000-0000000000ab',
        chain_depth: 1,
        request: { method: 'GET', url: '/sub' },
      }),
    });
    expect(res.status).toBe(200);
    // Two publish calls in the cache-cold path: minted + exchanged.
    expect(captured.length).toBeGreaterThanOrEqual(2);
    for (const event of captured) {
      expect(event.parentReceiptId).toBe('parent-hex');
      expect(event.swarmId).toBe('00000000-0000-0000-0000-0000000000ab');
      expect(event.chainDepth).toBe(1);
    }
  });
});
