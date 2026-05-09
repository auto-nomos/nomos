/**
 * Sprint 9.5 — end-to-end step-up flow across control-plane + PDP.
 *
 *   1. Sign up customer + create agent + Cedar policy with a cosigner gate.
 *   2. Mint UCAN.
 *   3. PDP authorize $250 → requiresStepUp + stepUpId.
 *   4. (Bypass WebAuthn) Mint cosigner UCAN directly — stand-in for the
 *      dashboard /approve/:id passkey flow.
 *   5. PDP authorize again with cosignerJwt → allow.
 *   6. PDP authorize $250 with no cosigner still → requiresStepUp.
 *
 * Skipped when SKIP_DB_TESTS=1.
 */
import { generateKeypair } from '@credential-broker/crypto';
import { issueUcan } from '@credential-broker/ucan';
import { eq } from 'drizzle-orm';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPolicyCache } from '../../../pdp/src/cache/policies.js';
import { createRevocationCache } from '../../../pdp/src/cache/revocations.js';
import type {
  StepUpCreateResponse,
  StepUpStateResponse,
} from '../../../pdp/src/control-plane/client.js';
import { createServer as createPdpServer } from '../../../pdp/src/server.js';
import { type Auth, createAuth } from '../auth/index.js';
import { loadConfig } from '../config.js';
import { createDb, type Db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { createServer as createCpServer } from '../server.js';
import { mintCosignerForApproval } from '../services/stepup/cosigner.js';

const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://cb:cb@localhost:5433/cb_dev';
const RUN = !process.env.SKIP_DB_TESTS;
const SERVICE_TOKEN = 'sprint9-e2e-token';

const cosignerPolicy = `
permit(
  principal,
  action == Action::"/stripe/charge",
  resource
)
when {
  resource.amount <= 100
};

permit(
  principal,
  action == Action::"/stripe/charge",
  resource
)
when {
  resource.amount > 100 && context has "cosigner" && context.cosigner == true
};
`;

describe.skipIf(!RUN)('Sprint 9 e2e: step-up across control-plane + PDP', () => {
  let db: Db;
  let auth: Auth;
  let customerId: string;
  let userId: string;
  let agentId: string;
  let agentDid: string;
  let cpApp: ReturnType<typeof createCpServer>;
  let pdpApp: ReturnType<typeof createPdpServer>;
  const cpSigning = generateKeypair();
  const logger = pino({ level: 'silent' });

  beforeAll(async () => {
    db = createDb({ DATABASE_URL: TEST_URL });
    await db.pool.query('SELECT 1');
    const config = loadConfig({ DATABASE_URL: TEST_URL });
    auth = createAuth({ db: db.drizzle, config, logger });

    cpApp = createCpServer({
      logger,
      db,
      auth,
      signing: { signKey: cpSigning.privateKey, signerDid: cpSigning.did },
      internal: { serviceToken: SERVICE_TOKEN },
      stepup: {
        notifier: vi.fn(async () => undefined) as never,
        dashboardPublicUrl: 'http://localhost:3000',
        defaultTtlSeconds: 60,
      },
    });

    // PDP wired to call cpApp via the Hono router (no real network).
    const cpFetch = (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const u = url instanceof URL ? url : url instanceof Request ? new URL(url.url) : new URL(url);
      return cpApp.request(u.pathname + u.search, init as RequestInit);
    };
    const policyCacheRef = createPolicyCache({
      fetchBundle: async () => cosignerPolicy,
      refreshIntervalMs: 60_000,
      logger,
    });
    const revocationCache = createRevocationCache({
      fetchRevocations: async () => [],
      refreshIntervalMs: 60_000,
      logger,
    });
    const policyCache = policyCacheRef;

    pdpApp = createPdpServer({
      logger,
      policyCache,
      revocationCache,
      stepup: {
        create: async (args): Promise<{ id: string; deepLink: string }> => {
          const res = await cpFetch('http://cp/v1/internal/stepup/create', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${SERVICE_TOKEN}`,
            },
            body: JSON.stringify({
              customer_id: args.customerId,
              agent_id: args.agentId,
              command: args.command,
              resource: args.resource,
              ...(args.originalUcanCid ? { original_ucan_cid: args.originalUcanCid } : {}),
            }),
          });
          if (!res.ok) throw new Error(`stepup create ${res.status}`);
          const body = (await res.json()) as StepUpCreateResponse & { deep_link: string };
          return { id: body.id, deepLink: (body as unknown as { deep_link: string }).deep_link };
        },
        getStepUp: async (id): Promise<StepUpStateResponse | undefined> => {
          const res = await cpFetch(`http://cp/v1/internal/stepup/${id}`, {
            headers: { authorization: `Bearer ${SERVICE_TOKEN}` },
          });
          if (res.status === 404) return undefined;
          if (!res.ok) throw new Error(`stepup get ${res.status}`);
          const b = (await res.json()) as {
            id: string;
            customer_id: string;
            agent_id: string;
            command: string;
            resource: unknown;
            state: 'pending' | 'approved' | 'denied' | 'expired';
            expires_at: string;
            decided_at: string | null;
            cosigner_attestation_jwt: string | null;
          };
          return {
            id: b.id,
            customerId: b.customer_id,
            agentId: b.agent_id,
            command: b.command,
            resource: b.resource,
            state: b.state,
            expiresAt: b.expires_at,
            decidedAt: b.decided_at,
            cosignerAttestationJwt: b.cosigner_attestation_jwt,
          };
        },
      },
    });

    // seed user + customer + membership + agent
    const email = `s9-e2e-${Date.now()}-${Math.random()}@test.test`;
    const signUp = await cpApp.request('/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'long-password-1', name: 'S9 e2e' }),
    });
    expect(signUp.status).toBe(200);
    const u = await db.drizzle.query.user.findFirst({ where: eq(schema.user.email, email) });
    userId = u!.id;
    const m = await db.drizzle.query.memberships.findFirst({
      where: eq(schema.memberships.userId, userId),
    });
    customerId = m!.customerId;
    agentDid = generateKeypair().did;
    const [a] = await db.drizzle
      .insert(schema.agents)
      .values({ customerId, name: 's9-e2e-agent', did: agentDid, status: 'active' })
      .returning({ id: schema.agents.id });
    agentId = a!.id;

    // Warm PDP caches so /v1/authorize doesn't 404 before the 60s sweep.
    policyCache.set(customerId, cosignerPolicy);
    revocationCache.set(customerId, []);
  });

  afterAll(async () => {
    await db.pool.query('DELETE FROM agents WHERE customer_id = $1', [customerId]);
    await db.pool.query('DELETE FROM customers WHERE id = $1', [customerId]);
    await db.pool.query('DELETE FROM "user" WHERE id = $1', [userId]);
    await db.pool.end();
  });

  it('full step-up flow: deny → step-up → mint cosigner → allow', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const ucan = issueUcan({
      payload: {
        iss: cpSigning.did,
        aud: agentDid,
        cmd: '/stripe/charge',
        pol: [],
        nonce: 'e2e-1',
        nbf: nowSec - 60,
        exp: nowSec + 600,
        meta: { agent_id: agentId },
      },
      privateKey: cpSigning.privateKey,
    });

    // First authorize — should requiresStepUp.
    const first = await pdpApp.request('/v1/authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': customerId },
      body: JSON.stringify({
        ucan: ucan.jwt,
        command: '/stripe/charge',
        resource: { amount: 250 },
        context: {},
      }),
    });
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as {
      allow: boolean;
      reason: string;
      requiresStepUp: boolean;
      stepUpId: string;
      stepUpUrl: string;
    };
    expect(firstBody.allow).toBe(false);
    expect(firstBody.reason).toBe('step_up_required');
    expect(firstBody.stepUpId).toBeTruthy();
    expect(firstBody.stepUpUrl).toContain('/approve/');

    // Bypass WebAuthn: mint cosigner directly (proxy for "user tapped approve").
    const cosigner = await mintCosignerForApproval(
      {
        approvalId: firstBody.stepUpId,
        customerId,
        decidingUserId: userId,
        nonce: `cos-${firstBody.stepUpId}`,
      },
      { db: db.drizzle, signKey: cpSigning.privateKey, signerDid: cpSigning.did },
    );
    expect(cosigner.cosignerJwt.split('.')).toHaveLength(3);

    // Second authorize WITH cosigner → allow.
    const second = await pdpApp.request('/v1/authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': customerId },
      body: JSON.stringify({
        ucan: ucan.jwt,
        command: '/stripe/charge',
        resource: { amount: 250 },
        context: {},
        cosignerJwt: cosigner.cosignerJwt,
      }),
    });
    const secondBody = (await second.json()) as { allow: boolean; reason?: string };
    expect(secondBody.allow).toBe(true);
    expect(secondBody.reason).toBeUndefined();

    // A fresh authorize for $250 with no cosigner still triggers step-up.
    const third = await pdpApp.request('/v1/authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': customerId },
      body: JSON.stringify({
        ucan: ucan.jwt,
        command: '/stripe/charge',
        resource: { amount: 250 },
        context: {},
      }),
    });
    const thirdBody = (await third.json()) as { requiresStepUp?: boolean };
    expect(thirdBody.requiresStepUp).toBe(true);
  });

  it('under-threshold charge passes without step-up', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const ucan = issueUcan({
      payload: {
        iss: cpSigning.did,
        aud: agentDid,
        cmd: '/stripe/charge',
        pol: [],
        nonce: 'e2e-low',
        nbf: nowSec - 60,
        exp: nowSec + 600,
        meta: { agent_id: agentId },
      },
      privateKey: cpSigning.privateKey,
    });
    const res = await pdpApp.request('/v1/authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': customerId },
      body: JSON.stringify({
        ucan: ucan.jwt,
        command: '/stripe/charge',
        resource: { amount: 50 },
        context: {},
      }),
    });
    const body = (await res.json()) as { allow: boolean; requiresStepUp?: boolean };
    expect(body.allow).toBe(true);
    expect(body.requiresStepUp).toBeUndefined();
  });
});
