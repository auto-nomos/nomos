#!/usr/bin/env tsx
import { issueUcan } from '@credential-broker/ucan';
/**
 * `pnpm tsx scripts/simulate-approval.mts <approvalId>`
 *
 * Bypass for the dashboard passkey UI when debugging the
 * agent → envelope → UCAN side of the dynamic-scope flow. Mints a
 * cosigner JWT from the control-plane signing key (read straight from
 * DATABASE_URL signing config in .env.local) and writes it into the
 * push_approvals row, flipping state → 'approved'. The SDK's
 * `waitForApproval` poll will see it on the next tick.
 *
 * NOT a production path. The dashboard passkey is the real auth
 * surface; this script just proves the rest of the wiring works.
 */
import { hexToBytes } from '@noble/hashes/utils';
import { eq } from 'drizzle-orm';
import { loadConfig } from '../apps/control-plane/src/config.js';
import { createDb } from '../apps/control-plane/src/db/index.js';
import * as schema from '../apps/control-plane/src/db/schema.js';

async function main(): Promise<void> {
  const approvalId = process.argv[2];
  if (!approvalId) {
    console.error('usage: tsx scripts/simulate-approval.mts <approvalId>');
    process.exit(1);
  }
  const config = loadConfig(process.env);
  const db = createDb(config);
  try {
    const approval = await db.drizzle.query.pushApprovals.findFirst({
      where: eq(schema.pushApprovals.id, approvalId),
    });
    if (!approval) {
      console.error(`no approval row with id ${approvalId}`);
      process.exit(2);
    }
    if (approval.state !== 'pending') {
      console.error(`approval state is ${approval.state}, not pending — refusing to overwrite`);
      process.exit(3);
    }
    const agent = await db.drizzle.query.agents.findFirst({
      where: eq(schema.agents.id, approval.agentId),
    });
    if (!agent) {
      console.error('agent missing');
      process.exit(4);
    }
    const owner = await db.drizzle.query.memberships.findFirst({
      where: eq(schema.memberships.customerId, approval.customerId),
    });
    const decidingUserId = owner?.userId ?? approval.customerId;

    const signKey = hexToBytes(config.CONTROL_PLANE_BUNDLE_SIGN_KEY);
    const signerDid = config.CONTROL_PLANE_BUNDLE_SIGN_DID;

    const cosigner = issueUcan({
      payload: {
        iss: signerDid,
        aud: agent.did,
        cmd: '/__envelope__',
        pol: [],
        nonce: `cosigner-${Date.now()}`,
        nbf: Math.floor(Date.now() / 1000) - 60,
        exp: Math.floor(Date.now() / 1000) + 600,
        meta: {
          cosigner_for: 'envelope-virtual-cid',
          approval_id: approvalId,
          decided_by: decidingUserId,
        },
      },
      privateKey: signKey,
    });
    await db.drizzle
      .update(schema.pushApprovals)
      .set({
        state: 'approved',
        decidedAt: new Date(),
        decidedBy: decidingUserId,
        cosignerAttestationJwt: cosigner.jwt,
      })
      .where(eq(schema.pushApprovals.id, approvalId));
    console.info(`✓ approval ${approvalId} flipped to approved`);
  } finally {
    await db.pool.end();
  }
}

void main().catch((err) => {
  console.error('failed:', err);
  process.exit(1);
});
