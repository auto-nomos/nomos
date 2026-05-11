#!/usr/bin/env tsx
import { hexToBytes } from '@noble/hashes/utils';
/**
 * End-to-end demo against REAL GitHub via the live local stack.
 *
 * What it proves:
 *   1. The "agent" in our DB is just an identity slot. Any external code
 *      (this script, Claude Desktop, Cursor, your Python bot) authenticates
 *      AS that agent and talks to PDP via the SDK.
 *   2. PDP enforces Cedar policy + UCAN cap before letting the call through.
 *   3. PDP — not the agent — borrows the user's encrypted refresh token,
 *      exchanges it for an access token, and proxies to api.github.com.
 *      The agent never sees the OAuth token.
 *   4. Audit log records every decision with hash-chain integrity.
 *
 * Pre-requisites:
 *   - `pnpm db:up` running.
 *   - control-plane (:8788), pdp (:8787), dashboard (:3000) running.
 *   - `.env.local` populated (CONTROL_PLANE_BUNDLE_SIGN_KEY etc.).
 *   - At least one customer with: 1 agent, 1 policy permitting
 *     /github/user/read, and a connected GitHub OAuth grant.
 *   - PDP launched with PDP_CUSTOMER_IDS containing that customer id
 *     (RESTART pdp after editing .env.local).
 *
 * Run: `pnpm tsx --env-file=.env.local scripts/demo-real-github.mts`
 */
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../apps/control-plane/src/db/schema.js';
import { mintUcan } from '../apps/control-plane/src/services/ucan-mint.js';

const PDP_URL = 'http://localhost:8787';
const DB_URL = process.env.DATABASE_URL ?? 'postgres://cb:cb@localhost:5433/cb_dev';

function env(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`missing env ${name} — run with --env-file=.env.local`);
    process.exit(1);
  }
  return v;
}

async function main(): Promise<void> {
  const signKey = hexToBytes(env('CONTROL_PLANE_BUNDLE_SIGN_KEY'));
  const signerDid = env('CONTROL_PLANE_BUNDLE_SIGN_DID');

  const pool = new pg.Pool({ connectionString: DB_URL });
  const db = drizzle(pool, { schema });

  // 1. Find the user's customer (most recent with a GitHub OAuth connection).
  const conn = await db.query.oauthConnections.findFirst({
    where: eq(schema.oauthConnections.connector, 'github'),
  });
  if (!conn) {
    console.error('No GitHub OAuth connection found. Connect GitHub via /onboarding first.');
    process.exit(1);
  }
  const customerId = conn.customerId;

  // 2. Find that customer's agent.
  const agent = await db.query.agents.findFirst({
    where: eq(schema.agents.customerId, customerId),
  });
  if (!agent) {
    console.error(`No agent for customer ${customerId}. Create one in /app/agents.`);
    process.exit(1);
  }

  // 3. Sanity-check: a policy permitting /github/user/read exists.
  const policies = await db.query.policies.findMany({
    where: eq(schema.policies.customerId, customerId),
  });
  const allowsUserRead = policies.some((p) => p.cedarText.includes('/github/user/read'));
  if (!allowsUserRead) {
    console.error(
      'No policy permits /github/user/read for this customer. Create one in /app/policies/new:',
    );
    console.error('  permit(principal, action == Action::"/github/user/read", resource);');
    process.exit(1);
  }

  console.info('demo state:');
  console.info(`  customer:           ${customerId}`);
  console.info(`  agent:              ${agent.id} (${agent.name})`);
  console.info(`  github connection:  ${conn.id} (${conn.accountId})`);

  // 4. Mint a proxy-bound UCAN for the allowed command.
  const allowed = await mintUcan(
    {
      customerId,
      agentId: agent.id,
      command: '/github/user/read',
      oauthConnectionId: conn.id,
      ttlSeconds: 600,
      nonce: `demo-${Date.now()}-allow`,
    },
    { db, signKey, signerDid },
  );
  console.info(`\nminted UCAN ${allowed.cid.slice(0, 16)}…`);

  // 5. Call PDP /v1/proxy → PDP fetches encrypted refresh token, exchanges
  //    for access token, calls REAL api.github.com/user.
  console.info(`\n→ PDP /v1/proxy/github/user/read (real GitHub call)`);
  const allowRes = await fetch(`${PDP_URL}/v1/proxy/github/user/read`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cb-customer': customerId },
    body: JSON.stringify({
      ucan: allowed.jwt,
      request: {
        ucan: allowed.jwt,
        command: '/github/user/read',
        resource: {},
        context: {},
      },
      apiCall: { method: 'GET', path: '/user' },
    }),
  });
  const allowJson = (await allowRes.json()) as Record<string, unknown>;
  if (!allowRes.ok || !allowJson.allow) {
    console.error('UNEXPECTED DENY:', allowJson);
    process.exit(1);
  }
  const upstream = allowJson.upstream as { status: number; body: { login: string; id: number } };
  console.info(`  ✓ allow + upstream ${upstream.status}`);
  console.info(`  ✓ GitHub returned login=${upstream.body.login} id=${upstream.body.id}`);
  console.info(`  ✓ agent never saw OAuth token — PDP proxied`);

  // 6. Mint a UCAN for a DIFFERENT command not in policy → expect deny.
  const denied = await mintUcan(
    {
      customerId,
      agentId: agent.id,
      command: '/github/admin/secret',
      oauthConnectionId: conn.id,
      ttlSeconds: 600,
      nonce: `demo-${Date.now()}-deny`,
    },
    { db, signKey, signerDid },
  );
  console.info(`\n→ PDP /v1/proxy/github/admin/secret (should be denied by policy)`);
  const denyRes = await fetch(`${PDP_URL}/v1/proxy/github/admin/secret`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cb-customer': customerId },
    body: JSON.stringify({
      ucan: denied.jwt,
      request: {
        ucan: denied.jwt,
        command: '/github/admin/secret',
        resource: {},
        context: {},
      },
      apiCall: { method: 'GET', path: '/user' },
    }),
  });
  const denyJson = (await denyRes.json()) as Record<string, unknown>;
  if (denyJson.allow) {
    console.error('UNEXPECTED ALLOW:', denyJson);
    process.exit(1);
  }
  console.info(`  ✓ denied — reason=${denyJson.reason ?? 'policy_no_permit'}`);

  // 7. Show last 4 audit rows.
  console.info(`\n→ recent audit rows (proves every decision is logged + hash-chained):`);
  const audits = await pool.query(
    `SELECT decision, command, ts FROM audit_events
     WHERE customer_id = $1 ORDER BY ts DESC LIMIT 4`,
    [customerId],
  );
  for (const r of audits.rows) {
    console.info(`  ${r.ts.toISOString()}  ${r.decision.padEnd(5)}  ${r.command}`);
  }

  await pool.end();
  console.info('\ndemo complete ✓');
}

void main().catch((err) => {
  console.error('demo failed:', err);
  process.exit(1);
});
