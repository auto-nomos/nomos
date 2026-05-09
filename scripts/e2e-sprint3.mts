#!/usr/bin/env tsx
/**
 * Sprint 3 end-to-end smoke test.
 *
 * Boots control-plane (port 8788) and PDP (port 8787) in-process against the
 * docker postgres started by `pnpm db:up`. Then:
 *   1. Sign up a brand-new customer via Better-Auth.
 *   2. Create an agent + policy via tRPC.
 *   3. Manually warm the PDP cache (avoids the 60s refresh wait).
 *   4. Mint a UCAN, hit PDP /v1/authorize, assert allow.
 *   5. Replace the policy with a forbid, re-warm cache, assert deny.
 *   6. Cleanup customer + user, exit.
 *
 * Run: `pnpm e2e:sprint3` (after `pnpm db:up`).
 */
import { generateKeypair } from '@credential-broker/crypto';
import { serve } from '@hono/node-server';
import { bytesToHex } from '@noble/hashes/utils';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { eq } from 'drizzle-orm';
import { pino } from 'pino';
import { createAuth } from '../apps/control-plane/src/auth/index.js';
import { loadConfig as loadCpConfig } from '../apps/control-plane/src/config.js';
import { createDb as createCpDb } from '../apps/control-plane/src/db/index.js';
import * as schema from '../apps/control-plane/src/db/schema.js';
import { createServer as createCpServer } from '../apps/control-plane/src/server.js';
import type { AppRouter } from '../apps/control-plane/src/trpc/router.js';
import { createPolicyCache } from '../apps/pdp/src/cache/policies.js';
import { createRevocationCache } from '../apps/pdp/src/cache/revocations.js';
import { createControlPlaneClient } from '../apps/pdp/src/control-plane/client.js';
import { createServer as createPdpServer } from '../apps/pdp/src/server.js';

const CP_PORT = 8788;
const PDP_PORT = 8787;
const SERVICE_TOKEN = 'sprint3-e2e-token';

function log(msg: string): void {
  console.info(`[e2e-sprint3] ${msg}`);
}

async function main(): Promise<void> {
  const logger = pino({ level: 'silent' });
  const signKp = generateKeypair();

  log('booting control-plane on :' + CP_PORT);
  const cpConfig = loadCpConfig();
  const cpDb = createCpDb(cpConfig);
  await cpDb.pool.query('SELECT 1'); // crash early if postgres missing
  const auth = createAuth({ db: cpDb.drizzle, config: cpConfig, logger });
  const cpApp = createCpServer({
    logger,
    db: cpDb,
    auth,
    internal: {
      signKey: signKp.privateKey,
      signerDid: signKp.did,
      serviceToken: SERVICE_TOKEN,
    },
  });
  const cpServer = serve({ fetch: cpApp.fetch, port: CP_PORT });

  log('booting PDP on :' + PDP_PORT);
  const cpClient = createControlPlaneClient({
    baseUrl: `http://127.0.0.1:${CP_PORT}`,
    serviceToken: SERVICE_TOKEN,
    bundleVerifyKey: bytesToHex(signKp.publicKey),
    logger,
  });
  const policyCache = createPolicyCache({
    fetchBundle: cpClient.fetchBundle,
    refreshIntervalMs: 60_000,
    logger,
  });
  const revocationCache = createRevocationCache({
    fetchRevocations: cpClient.fetchRevocations,
    refreshIntervalMs: 60_000,
    logger,
  });
  const pdpApp = createPdpServer({ logger, policyCache, revocationCache });
  const pdpServer = serve({ fetch: pdpApp.fetch, port: PDP_PORT });

  const cleanup = async (): Promise<void> => {
    pdpServer.close();
    cpServer.close();
    await cpDb.pool.end();
  };

  try {
    log('signing up new customer');
    const email = `e2e-${Date.now()}-${Math.random()}@e2ecorp.test`;
    const signUp = await fetch(`http://127.0.0.1:${CP_PORT}/auth/sign-up/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: `http://127.0.0.1:${CP_PORT}`,
      },
      body: JSON.stringify({ email, password: 'long-password-1', name: 'e2e tester' }),
    });
    if (!signUp.ok) {
      const body = await signUp.text();
      throw new Error(`sign-up ${signUp.status}: ${body}`);
    }
    const cookie = (signUp.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

    const u = await cpDb.drizzle.query.user.findFirst({ where: eq(schema.user.email, email) });
    if (!u) throw new Error('user not found after sign-up');
    const m = await cpDb.drizzle.query.memberships.findFirst({
      where: eq(schema.memberships.userId, u.id),
    });
    if (!m) throw new Error('membership not created');
    const customerId = m.customerId;
    log(`  customer=${customerId} user=${u.id}`);

    const trpc = createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: `http://127.0.0.1:${CP_PORT}/trpc`,
          headers: () => ({ cookie }),
        }),
      ],
    });

    log('creating agent + permit policy');
    const agent = await trpc.agents.create.mutate({ name: 'e2e-bot' });
    log(`  agent=${agent.id} did=${agent.did}`);
    const permitText = `permit(principal, action == Action::"/github/issue/create", resource);`;
    const policy = await trpc.policies.upsert.mutate({
      name: 'allow-issues',
      cedarText: permitText,
    });
    log(`  policy=${policy.id}`);

    log('warming PDP cache from control plane');
    const bundle = await cpClient.fetchBundle(customerId);
    if (!bundle) throw new Error('bundle empty');
    policyCache.set(customerId, bundle);
    revocationCache.set(customerId, (await cpClient.fetchRevocations(customerId)) ?? []);

    log('minting UCAN + calling PDP /v1/authorize → expect allow');
    const ucan = await trpc.ucans.mint.mutate({
      agentId: agent.id,
      command: '/github/issue/create',
      ttlSeconds: 600,
      nonce: 'e2e-allow',
    });

    const authorizeRes = await fetch(`http://127.0.0.1:${PDP_PORT}/v1/authorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': customerId },
      body: JSON.stringify({
        ucan: ucan.jwt,
        command: '/github/issue/create',
        resource: { repo: 'acme/billing' },
        context: {},
      }),
    });
    const allowBody = (await authorizeRes.json()) as { allow: boolean; reason?: string };
    log(`  PDP response: ${JSON.stringify(allowBody)}`);
    if (!allowBody.allow) {
      throw new Error(`expected allow, got ${JSON.stringify(allowBody)}`);
    }

    log('replacing policy with forbid + re-warming cache → expect deny');
    const forbidText = `forbid(principal, action == Action::"/github/issue/create", resource);`;
    await trpc.policies.upsert.mutate({
      id: policy.id,
      name: 'forbid-issues',
      cedarText: forbidText,
    });
    const newBundle = await cpClient.fetchBundle(customerId);
    if (!newBundle) throw new Error('refreshed bundle empty');
    policyCache.set(customerId, newBundle);

    const denyRes = await fetch(`http://127.0.0.1:${PDP_PORT}/v1/authorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': customerId },
      body: JSON.stringify({
        ucan: ucan.jwt,
        command: '/github/issue/create',
        resource: { repo: 'acme/billing' },
        context: {},
      }),
    });
    const denyBody = (await denyRes.json()) as { allow: boolean; reason?: string };
    log(`  PDP response: ${JSON.stringify(denyBody)}`);
    if (denyBody.allow) {
      throw new Error(`expected deny, got allow`);
    }

    log('cleanup');
    await cpDb.pool.query('DELETE FROM customers WHERE id = $1', [customerId]);
    await cpDb.pool.query('DELETE FROM "user" WHERE id = $1', [u.id]);

    log('PASS');
  } catch (err) {
    log(`FAIL: ${(err as Error).message}`);
    await cleanup();
    process.exit(1);
  }

  await cleanup();
  process.exit(0);
}

void main();
