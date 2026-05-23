#!/usr/bin/env tsx
/**
 * Sprint 5 end-to-end smoke test — the OAuth bridge wedge.
 *
 * Boots control-plane (port 8788) and PDP (port 8787) in-process against the
 * docker postgres started by `pnpm db:up`. A single mock fetch stands in for
 * both the upstream OAuth provider (token exchange + /user) and the upstream
 * SaaS API (POST /repos/.../issues), so the test exercises the entire wedge
 * without leaving the laptop.
 *
 * Steps:
 *   1. Sign up a brand-new customer + create an agent.
 *   2. Insert a Cedar policy that permits /github/issue/create on
 *      acme/billing only.
 *   3. Hit /v1/oauth/callback/github with a hand-crafted signed state to
 *      complete the OAuth handshake without a real GitHub redirect.
 *   4. Mint a proxy-bound UCAN (meta.oauth_connection_id) via mintUcan.
 *   5. Use @auto-nomos/sdk to call PDP /v1/proxy — assert allow +
 *      upstream 201 + bearer is the gho_* mock token (NOT the agent api key).
 *   6. Repeat against acme/payroll → assert deny + no upstream call.
 *   7. Repeat with a UCAN scoped to /issue/create against /pr/merge →
 *      assert deny (cmd_mismatch).
 *   8. Cleanup + exit.
 *
 * Run: `pnpm e2e:sprint5` (after `pnpm db:up`).
 *
 * The live-tunnel demo against real GitHub (per plan task 5.7) is deferred
 * until the user provisions a dev OAuth app + cloudflared tunnel.
 */
import { generateKeypair, generateSecretboxKeyHex } from '@auto-nomos/crypto';
import { createAuthGuard } from '@auto-nomos/sdk';
import { serve } from '@hono/node-server';
import { hexToBytes } from '@noble/hashes/utils';
import { eq } from 'drizzle-orm';
import { pino } from 'pino';
import { createAuth } from '../apps/control-plane/src/auth/index.js';
import { loadConfig as loadCpConfig } from '../apps/control-plane/src/config.js';
import { createDb as createCpDb } from '../apps/control-plane/src/db/index.js';
import * as schema from '../apps/control-plane/src/db/schema.js';
import { signState } from '../apps/control-plane/src/oauth/state.js';
import { createServer as createCpServer } from '../apps/control-plane/src/server.js';
import { mintUcan } from '../apps/control-plane/src/services/ucan-mint.js';
import { createPolicyCache } from '../apps/pdp/src/cache/policies.js';
import { createRevocationCache } from '../apps/pdp/src/cache/revocations.js';
import { createControlPlaneClient } from '../apps/pdp/src/control-plane/client.js';
import { createServer as createPdpServer } from '../apps/pdp/src/server.js';

const CP_PORT = 8788;
const PDP_PORT = 8787;
const SERVICE_TOKEN = 'sprint5-e2e-token';
const STATE_SECRET = 'sprint5-e2e-state-secret-32chars';
const ENC_KEY_HEX = generateSecretboxKeyHex();

const githubPolicy = `
permit(
  principal,
  action == Action::"/github/issue/create",
  resource
)
when {
  resource.repo == "acme/billing"
};
`;

interface MockState {
  exchangeCalls: number;
  apiCalls: { url: string; auth?: string }[];
}

function makeMockFetch(state: MockState): typeof fetch {
  return async (url, init) => {
    const u = String(url);
    const headers = (init?.headers as Record<string, string>) ?? {};
    if (u.startsWith('https://github.com/login/oauth/access_token')) {
      state.exchangeCalls += 1;
      return new Response(
        JSON.stringify({
          access_token: `gho_e2e_${state.exchangeCalls}`,
          refresh_token: `ghr_e2e_${state.exchangeCalls}`,
          scope: 'repo read:user',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (u.startsWith('https://api.github.com/user')) {
      return new Response(JSON.stringify({ login: 'e2e-bridge', id: 7 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (u.startsWith('https://api.github.com/repos/acme/billing/issues')) {
      state.apiCalls.push({ url: u, auth: headers.authorization });
      return new Response(JSON.stringify({ number: 42, title: 'paid' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (u.startsWith('https://api.github.com/repos/acme/payroll/issues')) {
      state.apiCalls.push({ url: u, auth: headers.authorization });
      return new Response(JSON.stringify({ number: 99 }), { status: 201 });
    }
    return new Response(`unmocked ${u}`, { status: 599 });
  };
}

function log(msg: string): void {
  console.info(`[e2e-sprint5] ${msg}`);
}

async function main(): Promise<void> {
  const logger = pino({ level: 'silent' });
  const signKp = generateKeypair();
  const encryptionKey = hexToBytes(ENC_KEY_HEX);
  const state: MockState = { exchangeCalls: 0, apiCalls: [] };
  const mockFetch = makeMockFetch(state);

  log(`booting control-plane on :${CP_PORT}`);
  const cpConfig = loadCpConfig({
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://cb:cb@localhost:5433/cb_dev',
    OAUTH_TOKEN_ENCRYPTION_KEY: ENC_KEY_HEX,
    OAUTH_STATE_SIGN_SECRET: STATE_SECRET,
    OAUTH_GITHUB_CLIENT_ID: 'gh-cid',
    OAUTH_GITHUB_CLIENT_SECRET: 'gh-sec',
    CONTROL_PLANE_PUBLIC_URL: `http://localhost:${CP_PORT}`,
    CONTROL_PLANE_SERVICE_TOKEN: SERVICE_TOKEN,
  });
  const cpDb = createCpDb(cpConfig);
  await cpDb.pool.query('SELECT 1');
  const auth = createAuth({ db: cpDb.drizzle, config: cpConfig, logger });
  const cpApp = createCpServer({
    logger,
    db: cpDb,
    auth,
    signing: { signKey: signKp.privateKey, signerDid: signKp.did },
    internal: { serviceToken: SERVICE_TOKEN },
    oauth: { config: cpConfig, encryptionKey, fetch: mockFetch },
  });
  const cpServer = serve({ fetch: cpApp.fetch, port: CP_PORT });
  await new Promise<void>((r) => setTimeout(r, 50));

  log(`booting pdp on :${PDP_PORT}`);
  const cpClient = createControlPlaneClient({
    baseUrl: `http://localhost:${CP_PORT}`,
    serviceToken: SERVICE_TOKEN,
    logger,
  });
  const policyCache = createPolicyCache({
    fetchBundle: async () => undefined,
    refreshIntervalMs: 60_000,
    logger,
  });
  const revocationCache = createRevocationCache({
    fetchRevocations: async () => undefined,
    refreshIntervalMs: 60_000,
    logger,
  });
  const pdpApp = createPdpServer({
    logger,
    policyCache,
    revocationCache,
    oauthProxy: {
      fetchOAuthToken: cpClient.fetchOAuthToken,
      refreshOAuthToken: cpClient.refreshOAuthToken,
      upstreamFetch: mockFetch,
    },
  });
  const pdpServer = serve({ fetch: pdpApp.fetch, port: PDP_PORT });
  await new Promise<void>((r) => setTimeout(r, 50));

  let customerId = '';
  let userId = '';
  try {
    log('signing up customer');
    const email = `e2e5-${Date.now()}-${Math.random()}@bridgecorp.test`;
    const signUp = await fetch(`http://localhost:${CP_PORT}/auth/sign-up/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: `http://localhost:${CP_PORT}`,
      },
      body: JSON.stringify({ email, password: 'long-password-1', name: 'Bridge E2E' }),
    });
    if (signUp.status !== 200) {
      const txt = await signUp.text().catch(() => '');
      throw new Error(`sign-up ${signUp.status}: ${txt}`);
    }
    const u = await cpDb.drizzle.query.user.findFirst({
      where: eq(schema.user.email, email),
    });
    userId = u!.id;
    const m = await cpDb.drizzle.query.memberships.findFirst({
      where: eq(schema.memberships.userId, userId),
    });
    customerId = m!.customerId;

    log('creating agent + policy');
    const [agentRow] = await cpDb.drizzle
      .insert(schema.agents)
      .values({
        customerId,
        name: 'bridge-agent',
        did: `did:key:e2e-${Math.random()}`,
      })
      .returning();
    const agent = agentRow!;
    await cpDb.drizzle.insert(schema.policies).values({
      customerId,
      name: 'github-issue-create-acme-billing',
      cedarText: githubPolicy,
    });
    policyCache.set(customerId, githubPolicy);

    log('completing OAuth callback (crafted signed state)');
    const stateParam = signState(STATE_SECRET, {
      customerId,
      connector: 'github',
      nonce: 'e2e-nonce',
      exp: Date.now() + 300_000,
    });
    const cbRes = await fetch(
      `http://localhost:${CP_PORT}/v1/oauth/callback/github?code=AUTHCODE&state=${encodeURIComponent(stateParam)}`,
    );
    if (cbRes.status !== 200) {
      const txt = await cbRes.text().catch(() => '');
      throw new Error(`callback ${cbRes.status}: ${txt}`);
    }
    const cb = (await cbRes.json()) as { connectionId: string; accountId: string };
    if (cb.accountId !== 'e2e-bridge') throw new Error(`unexpected accountId: ${cb.accountId}`);
    log(`connection ${cb.connectionId} stored`);

    log('minting proxy-bound UCAN');
    const ucan = await mintUcan(
      {
        customerId,
        agentId: agent.id,
        command: '/github/issue/create',
        oauthConnectionId: cb.connectionId,
        ttlSeconds: 600,
        nonce: 'e2e-bridge',
      },
      { db: cpDb.drizzle, signKey: signKp.privateKey, signerDid: signKp.did },
    );

    log('SDK.proxy /github/issue/create acme/billing → expect allow + upstream 201');
    const guard = createAuthGuard({
      apiKey: `cb_${customerId}_e2e-secret`,
      pdpUrl: `http://localhost:${PDP_PORT}`,
    });
    state.apiCalls.length = 0;
    const allow = await guard.proxy({
      ucan: ucan.jwt,
      command: '/github/issue/create',
      resource: { repo: 'acme/billing' },
      context: {},
      apiCall: {
        method: 'POST',
        path: '/repos/acme/billing/issues',
        body: { title: 'pay invoice' },
      },
    });
    if (!allow.allow) throw new Error(`expected allow, got ${JSON.stringify(allow)}`);
    if (allow.upstream?.status !== 201) {
      throw new Error(`upstream status ${allow.upstream?.status}`);
    }
    if (state.apiCalls.length !== 1) {
      throw new Error(`expected 1 upstream call, got ${state.apiCalls.length}`);
    }
    if (!/^Bearer gho_e2e_\d+$/.test(state.apiCalls[0]!.auth ?? '')) {
      throw new Error(`upstream bearer wrong: ${state.apiCalls[0]?.auth}`);
    }
    log('  ✓ upstream got mock GitHub token, agent never saw it');

    log('SDK.proxy with different repo → expect deny + no upstream call');
    state.apiCalls.length = 0;
    const denied = await guard.proxy({
      ucan: ucan.jwt,
      command: '/github/issue/create',
      resource: { repo: 'acme/payroll' },
      context: {},
      apiCall: { method: 'POST', path: '/repos/acme/payroll/issues' },
    });
    if (denied.allow) throw new Error('expected deny on wrong repo');
    if (state.apiCalls.length !== 0) {
      throw new Error('upstream was called on denied request');
    }
    log('  ✓ policy denied; upstream never called');

    log('SDK.proxy with /pr/merge using /issue/create UCAN → expect deny (cmd_mismatch)');
    state.apiCalls.length = 0;
    const cmdMismatch = await guard.proxy({
      ucan: ucan.jwt,
      command: '/github/pr/merge',
      resource: { repo: 'acme/billing' },
      context: {},
      apiCall: { method: 'POST', path: '/repos/acme/billing/pulls/1/merge' },
    });
    if (cmdMismatch.allow) throw new Error('expected deny on cmd mismatch');
    log('  ✓ command mismatch denied');

    log('all assertions green');
  } finally {
    log('cleanup');
    if (customerId) {
      await cpDb.pool.query('DELETE FROM customers WHERE id = $1', [customerId]);
    }
    if (userId) {
      await cpDb.pool.query('DELETE FROM "user" WHERE id = $1', [userId]);
    }
    pdpServer.close();
    cpServer.close();
    await cpDb.pool.end();
  }
}

void main().catch((err) => {
  console.error('[e2e-sprint5] FAILED', err);
  process.exit(1);
});
