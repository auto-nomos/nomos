#!/usr/bin/env tsx
/**
 * `pnpm demo` — the README's first interaction.
 *
 * Boots control-plane (port 8788) and PDP (port 8787) in-process against the
 * docker postgres started by `pnpm db:up`. A single mock fetch stands in for
 * the upstream OAuth provider + GitHub API, so the wedge runs end-to-end on
 * one laptop with no live SaaS credentials.
 *
 * What it proves, in order:
 *   1. Sign-up creates a customer + agent.
 *   2. A Cedar policy permits /github/issue/create on acme/billing only.
 *   3. OAuth callback completes (signed-state shortcut) — the control plane
 *      now holds the (mock) GitHub token.
 *   4. We mint a proxy-bound UCAN.
 *   5. SDK.proxy() through the PDP for acme/billing → ALLOW + upstream 201,
 *      with the mock GitHub token NEVER touching the agent.
 *   6. SDK.proxy() for acme/payroll → DENY by policy, no upstream call.
 *
 * For a deeper smoke test, see `scripts/e2e-sprint5.mts`.
 */
import { generateKeypair, generateSecretboxKeyHex } from '@credential-broker/crypto';
import { createAuthGuard } from '@credential-broker/sdk';
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
const SERVICE_TOKEN = 'demo-service-token';
const STATE_SECRET = 'demo-state-secret-32-chars-padded';
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
  apiCalls: { url: string; auth?: string }[];
}

function makeMockFetch(state: MockState): typeof fetch {
  return async (url, init) => {
    const u = String(url);
    const headers = (init?.headers as Record<string, string>) ?? {};
    if (u.startsWith('https://github.com/login/oauth/access_token')) {
      return new Response(
        JSON.stringify({
          access_token: 'gho_demo_token',
          refresh_token: 'ghr_demo_token',
          scope: 'repo read:user',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (u.startsWith('https://api.github.com/user')) {
      return new Response(JSON.stringify({ login: 'demo-user', id: 7 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (u.startsWith('https://api.github.com/repos/acme/billing/issues')) {
      state.apiCalls.push({ url: u, auth: headers.authorization });
      return new Response(JSON.stringify({ number: 42, title: 'pay invoice' }), {
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

const ICONS = { ok: '✓', arrow: '→', cross: '✗' } as const;

function step(msg: string): void {
  console.info(`${ICONS.arrow} ${msg}`);
}
function ok(msg: string): void {
  console.info(`  ${ICONS.ok} ${msg}`);
}

async function main(): Promise<void> {
  const logger = pino({ level: 'silent' });
  const signKp = generateKeypair();
  const encryptionKey = hexToBytes(ENC_KEY_HEX);
  const state: MockState = { apiCalls: [] };
  const mockFetch = makeMockFetch(state);

  step(`booting control-plane on :${CP_PORT}`);
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
  try {
    await cpDb.pool.query('SELECT 1');
  } catch (err) {
    console.error(`\n${ICONS.cross} cannot reach Postgres at ${cpConfig.DATABASE_URL}.`);
    console.error('  Run `pnpm db:up` first, then retry `pnpm demo`.');
    throw err;
  }
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

  step(`booting pdp on :${PDP_PORT}`);
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
    step('signing up demo customer');
    const email = `demo-${Date.now()}-${Math.random()}@bridgecorp.test`;
    const signUp = await fetch(`http://localhost:${CP_PORT}/auth/sign-up/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: `http://localhost:${CP_PORT}`,
      },
      body: JSON.stringify({ email, password: 'long-password-1', name: 'Demo' }),
    });
    if (signUp.status !== 200) {
      const txt = await signUp.text().catch(() => '');
      throw new Error(`sign-up ${signUp.status}: ${txt}`);
    }
    const u = await cpDb.drizzle.query.user.findFirst({ where: eq(schema.user.email, email) });
    userId = u!.id;
    const m = await cpDb.drizzle.query.memberships.findFirst({
      where: eq(schema.memberships.userId, userId),
    });
    customerId = m!.customerId;
    ok(`customer ${customerId} created`);

    step('creating agent + Cedar policy (allow /github/issue/create on acme/billing only)');
    const [agentRow] = await cpDb.drizzle
      .insert(schema.agents)
      .values({
        customerId,
        name: 'demo-agent',
        did: `did:key:demo-${Math.random()}`,
      })
      .returning();
    const agent = agentRow!;
    await cpDb.drizzle.insert(schema.policies).values({
      customerId,
      name: 'github-issue-create-acme-billing',
      cedarText: githubPolicy,
    });
    policyCache.set(customerId, githubPolicy);
    ok(`agent ${agent.id} ready`);

    step('completing OAuth callback (mock GitHub token now sealed in control plane)');
    const stateParam = signState(STATE_SECRET, {
      customerId,
      connector: 'github',
      nonce: 'demo-nonce',
      exp: Date.now() + 300_000,
    });
    const cbRes = await fetch(
      `http://localhost:${CP_PORT}/v1/oauth/callback/github?code=AUTHCODE&state=${encodeURIComponent(stateParam)}`,
    );
    if (cbRes.status !== 200) {
      throw new Error(`callback ${cbRes.status}`);
    }
    const cb = (await cbRes.json()) as { connectionId: string; accountId: string };
    ok(`oauth connection ${cb.connectionId}`);

    step('minting proxy-bound UCAN');
    const ucan = await mintUcan(
      {
        customerId,
        agentId: agent.id,
        command: '/github/issue/create',
        oauthConnectionId: cb.connectionId,
        ttlSeconds: 600,
        nonce: 'demo',
      },
      { db: cpDb.drizzle, signKey: signKp.privateKey, signerDid: signKp.did },
    );
    ok(`ucan cid ${ucan.cid.slice(0, 16)}… expires ${ucan.expiresAt.toISOString()}`);

    const guard = createAuthGuard({
      apiKey: `cb_${customerId}_demo-secret`,
      pdpUrl: `http://localhost:${PDP_PORT}`,
    });

    step('SDK.proxy create issue in acme/billing — expect ALLOW');
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
    if (!allow.allow || allow.upstream?.status !== 201) {
      throw new Error(`expected allow + 201, got ${JSON.stringify(allow)}`);
    }
    if (!/^Bearer gho_demo_token$/.test(state.apiCalls[0]?.auth ?? '')) {
      throw new Error('upstream did not receive the (mock) GitHub token from the PDP');
    }
    ok(`upstream 201 — PDP injected gho_demo_token, agent never saw it`);
    ok(`receipt ${allow.decision.receiptId}`);

    step('SDK.proxy create issue in acme/payroll — expect DENY');
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
      throw new Error('upstream was called on a denied request');
    }
    ok(`policy denied (${denied.decision.reason}); upstream untouched`);

    console.info('\nDemo green. Open http://localhost:3000/app/audit to view audit rows.');
    console.info(
      'Next: wire `@credential-broker/mcp-server` into Claude Desktop — see packages/mcp-server/README.md',
    );
  } finally {
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
  console.error(`\n${ICONS.cross} demo FAILED`, err);
  process.exit(1);
});
