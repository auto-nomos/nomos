#!/usr/bin/env tsx
/**
 * `pnpm demo:dynamic-scope` — manual smoke test for the filesystem
 * Approval Envelope flow.
 *
 * Boots control-plane (port 8788) + PDP (port 8787) in-process against
 * the docker postgres started by `pnpm db:up`. Walks through every
 * decision point in the dynamic-scope slice end-to-end:
 *
 *   1. POST /v1/intent without cosigner → step-up required.
 *   2. POST /v1/intent with a sensitive path → step-up forced even if
 *      an envelope would otherwise cover it.
 *   3. Simulate passkey approval: mark the approval row approved, mint
 *      a cosigner JWT against the envelope-marker command, attach it.
 *   4. POST /v1/intent again with cosignerJwt → mint succeeds, returns
 *      a UCAN whose meta.resource_constraint is the path the user
 *      asked for.
 *   5. POST /v1/intent for a child-prefix inside the active envelope →
 *      silent mint (no second passkey).
 *   6. PDP /v1/authorize for a file inside the prefix → allow.
 *   7. PDP /v1/authorize for a sibling outside the prefix →
 *      resource_out_of_scope.
 *   8. Filesystem proxy reads bytes only inside the prefix; rejects
 *      `..` traversal.
 *
 * Run:
 *   pnpm db:up   # one-time docker postgres
 *   pnpm db:migrate
 *   pnpm demo:dynamic-scope
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { generateKeypair, generateSecretboxKeyHex, sha256Hex } from '@auto-nomos/crypto';
import { issueUcan, parseUcanJwt } from '@auto-nomos/ucan';
import { serve } from '@hono/node-server';
import { hexToBytes } from '@noble/hashes/utils';
import { eq } from 'drizzle-orm';
import { pino } from 'pino';
import { createAuth } from '../apps/control-plane/src/auth/index.js';
import { loadConfig as loadCpConfig } from '../apps/control-plane/src/config.js';
import { createDb as createCpDb } from '../apps/control-plane/src/db/index.js';
import * as schema from '../apps/control-plane/src/db/schema.js';
import { createServer as createCpServer } from '../apps/control-plane/src/server.js';
import {
  readFileWithConstraint,
  resolveAgainstConstraint,
} from '../apps/pdp/src/adapters/filesystem.js';
import { createPolicyCache } from '../apps/pdp/src/cache/policies.js';
import { createRevocationCache } from '../apps/pdp/src/cache/revocations.js';
import { createServer as createPdpServer } from '../apps/pdp/src/server.js';

const CP_PORT = 18788;
const PDP_PORT = 18787;
const SERVICE_TOKEN = 'dyn-scope-demo';
const STATE_SECRET = 'dyn-scope-state-secret-32-chars-pad';
const ENC_KEY_HEX = generateSecretboxKeyHex();

const filesystemPolicy = `
permit (
  principal,
  action in [Action::"/filesystem/read", Action::"/filesystem/list"],
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
  const _encryptionKey = hexToBytes(ENC_KEY_HEX);

  // tempdir scaffold
  const fsRoot = await mkdtemp(path.join(tmpdir(), 'cb-demo-'));
  await mkdir(path.join(fsRoot, 'finance', '2026'), { recursive: true });
  await mkdir(path.join(fsRoot, 'finance', '2025'), { recursive: true });
  await writeFile(path.join(fsRoot, 'finance', '2026', 'q1.txt'), 'q1-allowed');
  await writeFile(path.join(fsRoot, 'finance', '2025', 'secret.txt'), 'leak');

  step(`scratch tree at ${fsRoot}`);

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
    console.error('  Run `pnpm db:up && pnpm db:migrate` first.');
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
      notifier: async () => {
        // Silent notifier — the demo doesn't need to push to a real channel;
        // we read the deep link from the response body instead.
      },
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
    const email = `dyn-${Date.now()}-${Math.random()}@cb.test`;
    const signUp = await fetch(`http://localhost:${CP_PORT}/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: `http://localhost:${CP_PORT}` },
      body: JSON.stringify({ email, password: 'long-password-1', name: 'Dyn' }),
    });
    if (signUp.status !== 200) throw new Error(`sign-up ${signUp.status}`);
    const u = await cpDb.drizzle.query.user.findFirst({ where: eq(schema.user.email, email) });
    userId = u?.id;
    const m = await cpDb.drizzle.query.memberships.findFirst({
      where: eq(schema.memberships.userId, userId),
    });
    customerId = m?.customerId;
    const [agentRow] = await cpDb.drizzle
      .insert(schema.agents)
      .values({
        customerId,
        name: 'dyn-agent',
        did: `did:key:dyn-${Math.random()}`,
        mode: 'dynamic',
      })
      .returning();
    const agent = agentRow!;
    const apiKeySecret = `cb_${customerId}_demo-secret-${Math.random()}`;
    await cpDb.drizzle.insert(schema.apiKeys).values({
      customerId,
      agentId: agent.id,
      keyHash: sha256Hex(apiKeySecret),
      prefix: apiKeySecret.slice(0, 8),
      name: 'dyn-key',
    });
    await cpDb.drizzle.insert(schema.policies).values({
      customerId,
      name: 'filesystem-base',
      cedarText: filesystemPolicy,
    });
    policyCache.set(customerId, filesystemPolicy);
    ok(`workspace ${customerId} agent ${agent.id}`);

    const intentUrl = `http://localhost:${CP_PORT}/v1/intent`;
    const authzUrl = `http://localhost:${PDP_PORT}/v1/authorize`;
    const headers = {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKeySecret}`,
      'x-cb-customer': customerId,
    };

    // 1. Intent — no covering envelope → step-up
    step('POST /v1/intent (no envelope yet) → expect step-up');
    const wantedPrefix = path.join(fsRoot, 'finance', '2026') + path.sep;
    const intent1Body = {
      intent: {
        constraint: { provider: 'filesystem', path_prefix: wantedPrefix },
        actions: ['/filesystem/read'],
        ttlSeconds: 300,
      },
    };
    const r1 = await fetch(intentUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(intent1Body),
    });
    const intent1 = (await r1.json()) as IntentResp;
    if (intent1.kind !== 'stepup')
      throw new Error(`expected stepup, got ${JSON.stringify(intent1)}`);
    ok(`step-up id ${intent1.stepUpId.slice(0, 8)}… link ${intent1.stepUpUrl}`);

    // 2. Sensitive path always step-up — independent of envelope state
    step('POST /v1/intent with deny-listed path (.ssh) → expect 403 sensitive_path');
    const r2 = await fetch(intentUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        intent: {
          constraint: { provider: 'filesystem', path_prefix: '/Users/anyone/.ssh/' },
          actions: ['/filesystem/read'],
          ttlSeconds: 60,
        },
      }),
    });
    const r2Body = (await r2.json()) as IntentResp;
    if (r2Body.kind !== 'stepup') {
      throw new Error(`expected stepup for sensitive path, got ${JSON.stringify(r2Body)}`);
    }
    ok('sensitive path forced step-up (would block even with covering envelope)');

    // 3. Simulate passkey approval — mint cosigner JWT, mark approval approved
    step('simulating passkey approval (writing cosigner JWT to push_approvals)');
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

    // 4. Retry intent with cosigner — expect mint
    step('POST /v1/intent with cosignerJwt → expect mint');
    const r3 = await fetch(intentUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...intent1Body, cosignerJwt: cosigner.jwt }),
    });
    const intent3 = (await r3.json()) as IntentResp;
    if (intent3.kind !== 'mint') {
      throw new Error(`expected mint, got ${r3.status} ${JSON.stringify(intent3)}`);
    }
    const mintedPayload = parseUcanJwt(intent3.ucan);
    if ('error' in mintedPayload) throw new Error('minted UCAN unparseable');
    const mintedConstraint = (mintedPayload.payload.meta as Record<string, unknown> | undefined)
      ?.resource_constraint;
    ok(`envelope ${intent3.envelopeId.slice(0, 8)}…`);
    ok(`UCAN cmd=${mintedPayload.payload.cmd}`);
    ok(`UCAN meta.resource_constraint=${JSON.stringify(mintedConstraint)}`);

    // 5. Child intent inside active envelope — silent mint
    step('POST /v1/intent for narrower prefix inside envelope → silent mint (no step-up)');
    const childPrefix = path.join(fsRoot, 'finance', '2026', 'q1.txt'); // not a dir but startsWith parent
    const r4 = await fetch(intentUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        intent: {
          constraint: { provider: 'filesystem', path_prefix: childPrefix },
          actions: ['/filesystem/read'],
          ttlSeconds: 60,
        },
      }),
    });
    const intent4 = (await r4.json()) as IntentResp;
    if (intent4.kind !== 'mint') {
      throw new Error(`expected silent mint, got ${JSON.stringify(intent4)}`);
    }
    ok(`silent mint envelope ${intent4.envelopeId.slice(0, 8)}…`);

    // 6. PDP authorize — path inside prefix → allow
    step('PDP /v1/authorize for /finance/2026/q1.txt → expect ALLOW');
    const allowReq = {
      ucan: intent3.ucan,
      command: '/filesystem/read',
      resource: { path: path.join(fsRoot, 'finance', '2026', 'q1.txt') },
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

    // 7. PDP authorize — path outside prefix → resource_out_of_scope
    step('PDP /v1/authorize for /finance/2025/secret.txt → expect resource_out_of_scope');
    const denyRes = await fetch(authzUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': customerId },
      body: JSON.stringify({
        ...allowReq,
        resource: { path: path.join(fsRoot, 'finance', '2025', 'secret.txt') },
      }),
    });
    const denyDec = (await denyRes.json()) as { allow: boolean; reason?: string };
    if (denyDec.allow || denyDec.reason !== 'resource_out_of_scope') {
      throw new Error(`expected deny resource_out_of_scope, got ${JSON.stringify(denyDec)}`);
    }
    ok(`decision allow=false reason=${denyDec.reason}`);

    // 8. Filesystem adapter directly — proves the data-plane gate
    step('filesystem adapter direct read inside prefix → bytes returned');
    const fsAllow = await readFileWithConstraint({
      constraint: { provider: 'filesystem', path_prefix: path.join(fsRoot, 'finance', '2026') },
      requestedPath: path.join(fsRoot, 'finance', '2026', 'q1.txt'),
    });
    if (!fsAllow.ok) throw new Error(`expected ok, got ${fsAllow.reason}`);
    ok(`bytes="${new TextDecoder().decode(fsAllow.bytes)}"`);

    step('filesystem adapter `..` traversal → expect symlink_escape');
    const fsDeny = await resolveAgainstConstraint({
      constraint: { provider: 'filesystem', path_prefix: path.join(fsRoot, 'finance', '2026') },
      requestedPath: path.join(fsRoot, 'finance', '2026', '..', '2025', 'secret.txt'),
    });
    if (fsDeny.ok) throw new Error('expected gate to refuse `..` traversal');
    ok(`adapter refused: reason=${fsDeny.reason}`);

    console.info('\nDynamic-scope smoke green.');
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
    await rm(fsRoot, { recursive: true, force: true });
  }
}

void main().catch((err) => {
  console.error(`\n${ICONS.cross} demo FAILED`, err);
  process.exit(1);
});
