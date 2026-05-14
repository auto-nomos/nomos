#!/usr/bin/env tsx
/**
 * Path A — subprocess swarm demo (3-deep delegation chain).
 *
 * Proves the full MAOS pipeline end-to-end on the local stack:
 *   planner ──fork──▶ researcher ──fork──▶ writer
 *      │                  │                   │
 *    list issues       list issues       list issues  (or create → step-up)
 *      └──── all three calls hit GitHub through PDP ─────┘
 *
 * Each fork:
 *   1. parent posts /v1/mint-child-ucan with its current chain + child agent id
 *      → CP signs the new UCAN with the parent agent's per-agent Ed25519 key
 *   2. parent spawns the child subprocess with NOMOS_PARENT_UCAN_CHAIN +
 *      NOMOS_SWARM_ID + NOMOS_PARENT_RECEIPT_ID set
 *   3. child SDK auto-detects the chain from env and the chain travels with
 *      every authorize() call
 *
 * Required env (commit a `.env.swarm.example` and source it):
 *   NOMOS_CP_URL                 https://api.auto-nomos.com  (or http://localhost:8788)
 *   NOMOS_PDP_URL                https://pdp.auto-nomos.com  (or http://localhost:8787)
 *   NOMOS_PLANNER_API_KEY        cb_live_…   (planner App)
 *   NOMOS_RESEARCHER_API_KEY     cb_live_…   (researcher App)
 *   NOMOS_WRITER_API_KEY         cb_live_…   (writer App)
 *   NOMOS_RESEARCHER_AGENT_ID    uuid
 *   NOMOS_WRITER_AGENT_ID        uuid
 *   NOMOS_SWARM_ID               uuid (the swarm rooted at planner)
 *   NOMOS_OAUTH_CONNECTION_ID    uuid (GitHub OAuth connection in this customer)
 *   NOMOS_GITHUB_OWNER           e.g. acme
 *   NOMOS_GITHUB_REPO            e.g. test-repo
 *   NOMOS_DEMO_WRITE             optional — set to "1" to make writer attempt
 *                                 a POST /issues (will trigger step-up in policy)
 *
 * Run:
 *   pnpm tsx --env-file=.env.swarm scripts/swarm-demo.mts
 */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import {
  createAuthGuard,
  ENV_PARENT_CHAIN,
  ENV_PARENT_RECEIPT,
  ENV_SWARM_ID,
  forkChildViaCp,
} from '@auto-nomos/sdk';

function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[swarm-demo] missing env ${name}`);
    process.exit(1);
  }
  return v;
}

const CP = need('NOMOS_CP_URL');
const PDP = need('NOMOS_PDP_URL');
const PLANNER_KEY = need('NOMOS_PLANNER_API_KEY');
const RESEARCHER_KEY = need('NOMOS_RESEARCHER_API_KEY');
const WRITER_KEY = need('NOMOS_WRITER_API_KEY');
const RESEARCHER_AGENT_ID = need('NOMOS_RESEARCHER_AGENT_ID');
const WRITER_AGENT_ID = need('NOMOS_WRITER_AGENT_ID');
const SWARM_ID = need('NOMOS_SWARM_ID');
const OAUTH_CONN_ID = need('NOMOS_OAUTH_CONNECTION_ID');
const OWNER = need('NOMOS_GITHUB_OWNER');
const REPO = need('NOMOS_GITHUB_REPO');
const DEMO_WRITE = process.env.NOMOS_DEMO_WRITE === '1';

const READ_CMD = '/github/issue/list';
const WRITE_CMD = '/github/issue/create';

async function main(): Promise<void> {
  console.info('━━━ planner ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Planner mints a root UCAN for itself + does the first authorize.
  const planner = createAuthGuard({
    pdpUrl: PDP,
    controlPlaneUrl: CP,
    apiKey: PLANNER_KEY,
  });
  const plannerUcans = await planner.mintUcan({
    commands: [READ_CMD],
    oauthConnectionId: OAUTH_CONN_ID,
  });
  const plannerLeafJwt = plannerUcans.get(READ_CMD)?.jwt;
  if (!plannerLeafJwt) throw new Error('planner failed to mint root UCAN');
  console.info(`  ✓ minted root UCAN  cmd=${READ_CMD}`);

  const plannerProxy = await planner.proxy({
    command: READ_CMD,
    ucan: plannerLeafJwt,
    swarm_id: SWARM_ID,
    apiCall: { method: 'GET', path: `/repos/${OWNER}/${REPO}/issues`, query: { per_page: '1' } },
  });
  if (!plannerProxy.allow) {
    console.error(
      `  ✗ planner authorize denied: ${plannerProxy.decision.reason} ${
        plannerProxy.decision.deny_reason ?? ''
      }`,
    );
    process.exit(1);
  }
  const plannerReceiptId = plannerProxy.decision.receiptId ?? '';
  console.info(`  ✓ proxy allow       receipt=${plannerReceiptId.slice(0, 12)}…`);
  console.info(`  ✓ github status     ${plannerProxy.upstream?.status}`);

  console.info('\n━━━ planner → researcher fork ━━━━━━━━━━━━━━━━━━━━━━━━');
  // Fork via CP: planner's chain so far is [plannerLeafJwt]; child gets a
  // narrower UCAN signed by the planner's per-agent key.
  const forkResearcher = await forkChildViaCp({
    controlPlaneUrl: CP,
    apiKey: PLANNER_KEY,
    parentChain: [plannerLeafJwt],
    childAgentId: RESEARCHER_AGENT_ID,
    command: READ_CMD,
    ttlSeconds: 300,
    parentReceiptId: plannerReceiptId,
    swarmId: SWARM_ID,
    oauthConnectionId: OAUTH_CONN_ID,
  });
  console.info(
    `  ✓ minted child UCAN cid=${forkResearcher.cid.slice(0, 12)}… chain.depth=${forkResearcher.chain.length}`,
  );

  await runChild('researcher', {
    NOMOS_API_KEY: RESEARCHER_KEY,
    NOMOS_CP_URL: CP,
    NOMOS_PDP_URL: PDP,
    NOMOS_OAUTH_CONNECTION_ID: OAUTH_CONN_ID,
    NOMOS_GITHUB_OWNER: OWNER,
    NOMOS_GITHUB_REPO: REPO,
    NOMOS_WRITER_API_KEY: WRITER_KEY,
    NOMOS_WRITER_AGENT_ID: WRITER_AGENT_ID,
    ...(DEMO_WRITE ? { NOMOS_DEMO_WRITE: '1' } : {}),
    [ENV_PARENT_CHAIN]: forkResearcher.env[ENV_PARENT_CHAIN] ?? '',
    [ENV_PARENT_RECEIPT]: forkResearcher.env[ENV_PARENT_RECEIPT] ?? '',
    [ENV_SWARM_ID]: forkResearcher.env[ENV_SWARM_ID] ?? '',
  });

  console.info('\n━━━ done ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.info(`Open the swarm view: ${CP.replace('api.', 'www.')}/app/swarms/${SWARM_ID}`);
}

function runChild(role: 'researcher' | 'writer', extraEnv: Record<string, string>): Promise<void> {
  return new Promise((resolveProm, reject) => {
    const child = spawn('pnpm', ['tsx', resolve('scripts/swarm-agent.mts'), role, WRITE_CMD], {
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
  console.error('[swarm-demo] failed:', err);
  process.exit(1);
});
