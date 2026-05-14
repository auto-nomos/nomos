#!/usr/bin/env tsx
/**
 * Path A — child subprocess for swarm-demo.
 *
 * Runs as either the researcher (depth=1) or the writer (depth=2). Reads
 * NOMOS_PARENT_UCAN_CHAIN from env, mints its own leaf UCAN via the SDK,
 * proxies a GitHub call. The researcher additionally forks the writer.
 *
 * Args: <role:researcher|writer> <writeCommand>
 */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import {
  createAuthGuard,
  ENV_PARENT_CHAIN,
  ENV_PARENT_RECEIPT,
  ENV_SWARM_ID,
  forkChildViaCp,
  readParentChainFromEnv,
} from '@auto-nomos/sdk';

const role = process.argv[2] as 'researcher' | 'writer' | undefined;
const writeCmd = process.argv[3] ?? '/github/issue/create';
if (role !== 'researcher' && role !== 'writer') {
  console.error('[swarm-agent] usage: swarm-agent.mts <researcher|writer> <writeCommand>');
  process.exit(2);
}

function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[${role}] missing env ${name}`);
    process.exit(1);
  }
  return v;
}

const CP = need('NOMOS_CP_URL');
const PDP = need('NOMOS_PDP_URL');
const API_KEY = need('NOMOS_API_KEY');
const OAUTH_CONN_ID = need('NOMOS_OAUTH_CONNECTION_ID');
const OWNER = need('NOMOS_GITHUB_OWNER');
const REPO = need('NOMOS_GITHUB_REPO');
const READ_CMD = '/github/issue/list';

async function main(): Promise<void> {
  const parent = readParentChainFromEnv();
  console.info(`\n━━━ ${role} (depth=${parent.chain.length}) ━━━━━━━━━━━━━━━━━━━━`);
  console.info(`  parent chain length: ${parent.chain.length}`);
  console.info(`  parent receipt:      ${parent.parentReceiptId?.slice(0, 12) ?? '<none>'}…`);
  console.info(`  swarm id:            ${parent.swarmId?.slice(0, 12) ?? '<none>'}…`);

  // The leaf is whatever the parent minted FOR us (chain.last). We do NOT
  // mintUcan here — that would create a fresh CP-signed root whose iss=CP,
  // breaking validateChain (parent.aud != child.iss).
  if (parent.chain.length === 0) {
    console.error(`[${role}] no parent chain in env`);
    process.exit(1);
  }
  const leafJwt = parent.chain[parent.chain.length - 1] as string;

  const guard = createAuthGuard({ pdpUrl: PDP, controlPlaneUrl: CP, apiKey: API_KEY });
  const proxy = await guard.proxy({
    ucan: leafJwt,
    command: READ_CMD,
    resource: { provider: 'github', owner: OWNER, repo: REPO },
    context: {},
    delegated_chain: parent.chain,
    ...(parent.parentReceiptId ? { parent_receipt_id: parent.parentReceiptId } : {}),
    ...(parent.swarmId ? { swarm_id: parent.swarmId } : {}),
    apiCall: { method: 'GET', path: `/repos/${OWNER}/${REPO}/issues`, query: { per_page: '1' } },
  });
  if (!proxy.allow) {
    console.error(
      `  ✗ ${role} authorize denied: ${proxy.decision.reason} ${proxy.decision.deny_reason ?? ''}`,
    );
    process.exit(1);
  }
  const myReceipt = proxy.decision.receiptId ?? '';
  console.info(`  ✓ proxy allow       receipt=${myReceipt.slice(0, 12)}…`);
  console.info(`  ✓ github status     ${proxy.upstream?.status}`);

  // Researcher forks the writer; writer is the leaf — no further forks.
  if (role === 'researcher') {
    const writerKey = need('NOMOS_WRITER_API_KEY');
    const writerAgentId = need('NOMOS_WRITER_AGENT_ID');
    const fork = await forkChildViaCp({
      controlPlaneUrl: CP,
      apiKey: API_KEY,
      parentChain: parent.chain,
      childAgentId: writerAgentId,
      command: process.env.NOMOS_DEMO_WRITE === '1' ? writeCmd : READ_CMD,
      ttlSeconds: 180,
      parentReceiptId: myReceipt,
      ...(parent.swarmId ? { swarmId: parent.swarmId } : {}),
      oauthConnectionId: OAUTH_CONN_ID,
    });
    console.info(
      `\n  ✓ forked writer    cid=${fork.cid.slice(0, 12)}… chain.depth=${fork.chain.length}`,
    );
    await runChild('writer', writeCmd, {
      NOMOS_API_KEY: writerKey,
      NOMOS_CP_URL: CP,
      NOMOS_PDP_URL: PDP,
      NOMOS_OAUTH_CONNECTION_ID: OAUTH_CONN_ID,
      NOMOS_GITHUB_OWNER: OWNER,
      NOMOS_GITHUB_REPO: REPO,
      ...(process.env.NOMOS_DEMO_WRITE === '1' ? { NOMOS_DEMO_WRITE: '1' } : {}),
      [ENV_PARENT_CHAIN]: fork.env[ENV_PARENT_CHAIN] ?? '',
      [ENV_PARENT_RECEIPT]: fork.env[ENV_PARENT_RECEIPT] ?? '',
      [ENV_SWARM_ID]: fork.env[ENV_SWARM_ID] ?? '',
    });
  }
}

function runChild(
  role: 'writer',
  writeCmd: string,
  extraEnv: Record<string, string>,
): Promise<void> {
  return new Promise((resolveProm, reject) => {
    const child = spawn('pnpm', ['tsx', resolve('scripts/swarm-agent.mts'), role, writeCmd], {
      env: { ...process.env, ...extraEnv },
      stdio: 'inherit',
    });
    child.on('exit', (code) => {
      if (code === 0) resolveProm();
      else reject(new Error(`${role} exited with code ${code}`));
    });
  });
}

main().catch((err) => {
  console.error(`[${role}] failed:`, err);
  process.exit(1);
});
