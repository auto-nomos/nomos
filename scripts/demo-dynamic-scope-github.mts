#!/usr/bin/env tsx
/**
 * `pnpm demo:dynamic-scope-github` — manual smoke for the GitHub
 * variant of dynamic scope.
 *
 * Boots control-plane (port 18790) + PDP (port 18789) in-process and
 * walks every load-bearing decision point of the GitHub slice:
 *
 *   1. agent.mode='static' → /v1/intent rejected with agent_static_mode
 *   2. flip mode='dynamic' → first /v1/intent returns step-up
 *   3. simulate passkey approval (mint cosigner JWT, mark approved)
 *   4. retry → mint envelope + child UCAN with github constraint
 *   5. silent mint inside envelope (same repo, narrower pr_number)
 *   6. authorize for owner+repo claim that matches → allow
 *   7. authorize for sibling repo claim → resource_out_of_scope
 *   8. github adapter directly: in-scope URL allowed; out-of-scope
 *      /repos/acme/payroll refused even though the agent could lie
 *      about request.resource (this is the data-plane gate).
 */
import { generateKeypair, generateSecretboxKeyHex, sha256Hex } from '@credential-broker/crypto';
import { issueUcan, parseUcanJwt } from '@credential-broker/ucan';
import { serve } from '@hono/node-server';
import { hexToBytes } from '@noble/hashes/utils';
import { eq } from 'drizzle-orm';
import { pino } from 'pino';
import { createAuth } from '../apps/control-plane/src/auth/index.js';
import { loadConfig as loadCpConfig } from '../apps/control-plane/src/config.js';
import { createDb as createCpDb } from '../apps/control-plane/src/db/index.js';
import * as schema from '../apps/control-plane/src/db/schema.js';
import { createServer as createCpServer } from '../apps/control-plane/src/server.js';
import { validateGithubProxyCall } from '../apps/pdp/src/adapters/github.js';
import { createPolicyCache } from '../apps/pdp/src/cache/policies.js';
import { createRevocationCache } from '../apps/pdp/src/cache/revocations.js';
import { createServer as createPdpServer } from '../apps/pdp/src/server.js';

const CP_PORT = 18790;
const PDP_PORT = 18789;
const SERVICE_TOKEN = 'dyn-gh-demo';
const STATE_SECRET = 'dyn-gh-state-secret-32-chars-pad';
const ENC_KEY_HEX = generateSecretboxKeyHex();

const githubPolicy = `
permit (
  principal,
  action in [Action::"/github/repo/read", Action::"/github/issue/create"],
  resource
);
`;

const ICONS = { ok: '✓', arrow: '→', cross: '✗' } as const;
const step = (m: string): void => console.info(`${ICONS.arrow} ${m}`);
const ok = (m: string): void => console.info(`  ${ICONS.ok} ${m}`);

interface IntentMintResp {
  kind: 'mint';
  ucan: string;
  envelopeId: string;
  expiresAt: number;
}
interface IntentStepUpResp {
  kind: 'stepup';
  stepUpId: string;
  stepUpUrl: string;
  proposedEnvelope: unknown;
}
type IntentResp = IntentMintResp | IntentStepUpResp;

async function main(): Promise<void> {
  const logger = pino({ level: 'silent' });
  const signKp = generateKeypair();
  void hexToBytes(ENC_KEY_HEX);

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
    DASHBOARD_PUBLIC_URL: 'http://localhost:3000',
  });
  const cpDb = createCpDb(cpConfig);
  try {
    await cpDb.pool.query('SELECT 1');
  } catch (err) {
    console.error(`\n${ICONS.cross} cannot reach Postgres at ${cpConfig.DATABASE_URL}.`);
    console.error('  Run `pnpm db:up && pnpm -C apps/control-plane db:migrate` first.');
    throw err;
  }
  const auth = createAuth({ db: cpDb.drizzle, config: cpConfig, logger });
  const cpApp = createCpServer({
    logger,
    db: cpDb,
    auth,
    signing: { signKey: signKp.privateKey, signerDid: signKp.did },
    internal: { serviceToken: SERVICE_TOKEN },
    stepup: {
      notifier: async () => {},
      dashboardPublicUrl: 'http://localhost:3000',
      defaultTtlSeconds: 60,
    },
  });
  const cpServer = serve({ fetch: cpApp.fetch, port: CP_PORT });
  await new Promise<void>((r) => setTimeout(r, 50));

  step(`booting pdp on :${PDP_PORT}`);
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
    trustedIssuerDid: signKp.did,
  });
  const pdpServer = serve({ fetch: pdpApp.fetch, port: PDP_PORT });
  await new Promise<void>((r) => setTimeout(r, 50));

  let customerId = '';
  let userId = '';
  try {
    step('signing up demo workspace + agent + API key');
    const email = `dyn-gh-${Date.now()}-${Math.random()}@cb.test`;
    const signUp = await fetch(`http://localhost:${CP_PORT}/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: `http://localhost:${CP_PORT}` },
      body: JSON.stringify({ email, password: 'long-password-1', name: 'DynGh' }),
    });
    if (signUp.status !== 200) throw new Error(`sign-up ${signUp.status}`);
    const u = await cpDb.drizzle.query.user.findFirst({ where: eq(schema.user.email, email) });
    userId = u!.id;
    const m = await cpDb.drizzle.query.memberships.findFirst({
      where: eq(schema.memberships.userId, userId),
    });
    customerId = m!.customerId;
    const [agentRow] = await cpDb.drizzle
      .insert(schema.agents)
      .values({
        customerId,
        name: 'dyn-gh-agent',
        did: `did:key:dyngh-${Math.random()}`,
        // agent starts in static mode (default) — we exercise the mode
        // toggle below.
      })
      .returning();
    const agent = agentRow!;
    const apiKeySecret = `cb_${customerId}_demo-secret-${Math.random()}`;
    await cpDb.drizzle.insert(schema.apiKeys).values({
      customerId,
      agentId: agent.id,
      keyHash: sha256Hex(apiKeySecret),
      prefix: apiKeySecret.slice(0, 8),
      name: 'dyn-gh-key',
    });
    await cpDb.drizzle.insert(schema.policies).values({
      customerId,
      name: 'github-base',
      cedarText: githubPolicy,
    });
    policyCache.set(customerId, githubPolicy);
    ok(`workspace ${customerId.slice(0, 8)}… agent ${agent.id.slice(0, 8)}… (mode=static)`);

    const intentUrl = `http://localhost:${CP_PORT}/v1/intent`;
    const authzUrl = `http://localhost:${PDP_PORT}/v1/authorize`;
    const headers = {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKeySecret}`,
      'x-cb-customer': customerId,
    };

    // 1. Static mode → /v1/intent should be rejected.
    step('POST /v1/intent while agent.mode=static → expect 403 agent_static_mode');
    const intentBody = {
      intent: {
        constraint: { provider: 'github', owner: 'acme', repo: 'billing' },
        actions: ['/github/repo/read'],
        ttlSeconds: 300,
      },
    };
    const r0 = await fetch(intentUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(intentBody),
    });
    if (r0.status !== 403) {
      throw new Error(`expected 403, got ${r0.status} ${await r0.text()}`);
    }
    const r0Body = (await r0.json()) as { error_code: string };
    if (r0Body.error_code !== 'agent_static_mode') {
      throw new Error(`expected agent_static_mode, got ${JSON.stringify(r0Body)}`);
    }
    ok(`static-mode reject: error_code=${r0Body.error_code}`);

    // 2. Flip mode → dynamic and retry.
    step('flipping agent.mode=dynamic');
    await cpDb.drizzle
      .update(schema.agents)
      .set({ mode: 'dynamic' })
      .where(eq(schema.agents.id, agent.id));
    ok('agent.mode=dynamic');

    step('POST /v1/intent (no envelope yet) → expect step-up');
    const r1 = await fetch(intentUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(intentBody),
    });
    const intent1 = (await r1.json()) as IntentResp;
    if (intent1.kind !== 'stepup') {
      throw new Error(`expected stepup, got ${JSON.stringify(intent1)}`);
    }
    ok(`step-up id ${intent1.stepUpId.slice(0, 8)}… link ${intent1.stepUpUrl}`);

    // 3. Simulate passkey approval → mint cosigner.
    step('simulating passkey approval (cosigner JWT into push_approvals)');
    const cosigner = issueUcan({
      payload: {
        iss: signKp.did,
        aud: agent.did,
        cmd: '/__envelope__',
        pol: [],
        nonce: `cosigner-${Date.now()}`,
        nbf: Math.floor(Date.now() / 1000) - 60,
        exp: Math.floor(Date.now() / 1000) + 300,
        meta: {
          cosigner_for: 'envelope-virtual-cid',
          approval_id: intent1.stepUpId,
          decided_by: userId,
        },
      },
      privateKey: signKp.privateKey,
    });
    await cpDb.drizzle
      .update(schema.pushApprovals)
      .set({
        state: 'approved',
        decidedAt: new Date(),
        decidedBy: userId,
        cosignerAttestationJwt: cosigner.jwt,
      })
      .where(eq(schema.pushApprovals.id, intent1.stepUpId));
    ok(`approval ${intent1.stepUpId.slice(0, 8)}… now approved`);

    // 4. Retry intent with cosigner → mint.
    step('POST /v1/intent with cosignerJwt → expect mint with github constraint');
    const r3 = await fetch(intentUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...intentBody, cosignerJwt: cosigner.jwt }),
    });
    const intent3 = (await r3.json()) as IntentResp;
    if (intent3.kind !== 'mint') {
      throw new Error(`expected mint, got ${r3.status} ${JSON.stringify(intent3)}`);
    }
    const mintedPayload = parseUcanJwt(intent3.ucan);
    if ('error' in mintedPayload) throw new Error('minted UCAN unparseable');
    const mintedConstraint = (mintedPayload.payload.meta as Record<string, unknown> | undefined)
      ?.resource_constraint;
    const mintedMode = (mintedPayload.payload.meta as Record<string, unknown> | undefined)?.mode;
    ok(`envelope ${intent3.envelopeId.slice(0, 8)}…`);
    ok(`UCAN cmd=${mintedPayload.payload.cmd} mode=${String(mintedMode)}`);
    ok(`UCAN meta.resource_constraint=${JSON.stringify(mintedConstraint)}`);

    // 5. Silent mint inside envelope (narrower constraint that's a subset).
    step('POST /v1/intent for narrower {owner, repo, pr_number=42} → silent mint');
    const r4 = await fetch(intentUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        intent: {
          constraint: { provider: 'github', owner: 'acme', repo: 'billing', pr_number: 42 },
          actions: ['/github/repo/read'],
          ttlSeconds: 60,
        },
      }),
    });
    const intent4 = (await r4.json()) as IntentResp;
    if (intent4.kind !== 'mint') {
      throw new Error(`expected silent mint, got ${JSON.stringify(intent4)}`);
    }
    ok(`silent mint envelope ${intent4.envelopeId.slice(0, 8)}…`);

    // 6. PDP authorize — owner+repo matches constraint → allow.
    step('PDP /v1/authorize for {owner: acme, repo: billing} → expect ALLOW');
    const allowReq = {
      ucan: intent3.ucan,
      command: '/github/repo/read',
      resource: { owner: 'acme', repo: 'billing' },
      context: {},
    };
    const allowRes = await fetch(authzUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': customerId },
      body: JSON.stringify(allowReq),
    });
    const allowDec = (await allowRes.json()) as { allow: boolean; reason?: string };
    if (!allowDec.allow) throw new Error(`expected allow, got ${JSON.stringify(allowDec)}`);
    ok('decision allow=true');

    // 7. PDP authorize — different repo → resource_out_of_scope.
    step('PDP /v1/authorize for {owner: acme, repo: payroll} → expect resource_out_of_scope');
    const denyRes = await fetch(authzUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': customerId },
      body: JSON.stringify({
        ...allowReq,
        resource: { owner: 'acme', repo: 'payroll' },
      }),
    });
    const denyDec = (await denyRes.json()) as { allow: boolean; reason?: string };
    if (denyDec.allow || denyDec.reason !== 'resource_out_of_scope') {
      throw new Error(`expected deny resource_out_of_scope, got ${JSON.stringify(denyDec)}`);
    }
    ok(`decision allow=false reason=${denyDec.reason}`);

    // 8. github adapter direct: in-scope URL allowed, sibling repo URL refused.
    step('github adapter for /repos/acme/billing → ok');
    const adapterAllow = validateGithubProxyCall(
      { provider: 'github', owner: 'acme', repo: 'billing' },
      { method: 'GET', path: '/repos/acme/billing' },
    );
    if (!adapterAllow.ok) throw new Error(`expected ok, got ${JSON.stringify(adapterAllow)}`);
    ok('adapter ok=true');

    step('github adapter for /repos/acme/payroll → refused with repo_mismatch');
    const adapterDeny = validateGithubProxyCall(
      { provider: 'github', owner: 'acme', repo: 'billing' },
      { method: 'GET', path: '/repos/acme/payroll' },
    );
    if (adapterDeny.ok) throw new Error('expected adapter to refuse');
    ok(`adapter refused: reason=${adapterDeny.reason}`);

    console.info('\nDynamic-scope GitHub smoke green.');
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
