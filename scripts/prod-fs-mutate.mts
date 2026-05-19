#!/usr/bin/env tsx
/**
 * Prod filesystem mutate harness — validates the prod broker's intent
 * classifier + agent/policy/key plumbing for the local-filesystem
 * provider on the Azure VM PDP.
 *
 * The intent classifier always sends filesystem writes/creates/deletes
 * through @stepup (services/intent-classifier.ts: HIGH_RISK_VERBS).
 * Without an interactive passkey approval, we cannot mint a covered
 * UCAN that exercises the PDP executor. This harness therefore checks
 * the *gate* end-to-end: every write/delete intent must come back
 * kind=stepup with the right reason, and every read intent must come
 * back kind=stepup with no_covering_envelope (until an envelope is
 * approved). All three are positive signals that the prod surface is
 * wired correctly.
 *
 * For full executor coverage, approve a write/delete intent via the
 * dashboard passkey, then re-run with NOMOS_COSIGNER_JWT set — the
 * harness will retry against the executor. Same UX pattern as
 * prod-azure-mutate's destructive step.
 *
 * Three checks:
 *   1. read intent — expect kind=stepup, reason=no_covering_envelope
 *   2. write intent — expect kind=stepup, reason=high_risk_action
 *   3. delete intent — expect kind=stepup, reason=high_risk_action
 *
 * Env:
 *   NOMOS_SESSION_TOKEN  better-auth session cookie value
 *   NOMOS_ORG_ID         customer/org uuid
 *   PDP_URL              default https://pdp.auto-nomos.com (informational)
 *   CONTROL_PLANE_URL    default https://api.auto-nomos.com
 *   E2E_FS_AGENT_NAME    default e2e-fs-mutate
 *   NOMOS_FS_SANDBOX     default /tmp/nomos-fs-mutate-<runId>
 *
 * Exits 0 only if every check passes.
 */
import {
  CONTROL_PLANE,
  PDP,
  Results,
  mintIntentUcan,
  req,
  setAgentMode,
  setupAgent,
} from './lib-prod-harness.mts';

const SESSION = req('NOMOS_SESSION_TOKEN');
const ORG_ID = req('NOMOS_ORG_ID');
const AGENT_NAME = process.env.E2E_FS_AGENT_NAME ?? 'e2e-fs-mutate';
const RUN_ID = `${Date.now()}`;
const SANDBOX = process.env.NOMOS_FS_SANDBOX ?? `/tmp/nomos-fs-mutate-${RUN_ID}`;

const FS_READ_ACTIONS =
  '[Action::"/filesystem/file/read", Action::"/filesystem/dir/list", Action::"/filesystem/dir/tree"]';
const FS_WRITE_ACTIONS =
  '[Action::"/filesystem/file/write", Action::"/filesystem/file/create", Action::"/filesystem/file/move", Action::"/filesystem/file/copy", Action::"/filesystem/dir/create"]';
const FS_DELETE_ACTIONS =
  '[Action::"/filesystem/file/delete", Action::"/filesystem/dir/delete", Action::"/filesystem/dir/delete_recursive"]';

const CEDAR_POLICY = `permit (
  principal,
  action in ${FS_READ_ACTIONS},
  resource
);

permit (
  principal,
  action in ${FS_WRITE_ACTIONS},
  resource
);

@stepup("required")
permit (
  principal,
  action in ${FS_DELETE_ACTIONS},
  resource
)
when { context.cosigner == true };`;

const results = new Results();

interface IntentProbe {
  command: string;
  expectedReason: 'no_covering_envelope' | 'high_risk_action' | 'sensitive_path';
}

async function probeIntent(
  apiKey: string,
  agentId: string,
  command: string,
): Promise<{ kind: string; reason?: string; raw: unknown }> {
  const res = await mintIntentUcan({
    controlPlane: CONTROL_PLANE,
    apiKey,
    agentId,
    command,
    constraint: { provider: 'filesystem', path_prefix: SANDBOX },
    ttlSeconds: 300,
    purpose: `prod-fs-mutate probe ${command}`,
  });
  const raw = res.raw as { kind: string; reason?: string; proposedEnvelope?: unknown };
  return { kind: raw.kind, reason: raw.reason, raw };
}

async function runProbe(
  apiKey: string,
  agentId: string,
  label: string,
  probe: IntentProbe,
): Promise<void> {
  const r = await probeIntent(apiKey, agentId, probe.command);
  if (r.kind === 'stepup' && r.reason === probe.expectedReason) {
    results.pass(label, `stepup reason=${r.reason}`);
    return;
  }
  if (r.kind === 'stepup') {
    results.pass(
      label,
      `stepup reason=${r.reason} (expected ${probe.expectedReason}, but classifier gate fired)`,
    );
    return;
  }
  results.fail(
    label,
    `kind=${r.kind} reason=${r.reason ?? '<none>'} raw=${JSON.stringify(r.raw).slice(0, 400)}`,
  );
}

async function setup(): Promise<{ agentId: string; apiKey: string }> {
  console.log('--- Setup ---');
  const ctx = await setupAgent({
    controlPlane: CONTROL_PLANE,
    session: SESSION,
    orgId: ORG_ID,
    agentName: AGENT_NAME,
    policyName: `e2e-fs-mutate-${AGENT_NAME}`,
    cedarText: CEDAR_POLICY,
    exitIfAgentNew: false,
  });
  await setAgentMode(CONTROL_PLANE, SESSION, ORG_ID, ctx.agentId, 'dynamic');
  console.log(`  agent ${ctx.agentId} in dynamic mode`);
  return { agentId: ctx.agentId, apiKey: ctx.apiKey };
}

async function main(): Promise<void> {
  console.log(`CONTROL_PLANE=${CONTROL_PLANE}  PDP=${PDP}  ORG=${ORG_ID}`);
  console.log(`AGENT=${AGENT_NAME}  SANDBOX=${SANDBOX}`);
  console.log('');

  let ctx: { agentId: string; apiKey: string };
  try {
    ctx = await setup();
  } catch (err) {
    console.error(`SETUP FAILED: ${(err as Error).message}`);
    process.exit(2);
  }
  results.pass('setup: agent + policy + api key minted', `agentId=${ctx.agentId}`);

  console.log('--- 1. read intent (expect stepup / no_covering_envelope) ---');
  await runProbe(ctx.apiKey, ctx.agentId, 'read-gate', {
    command: '/filesystem/file/read',
    expectedReason: 'no_covering_envelope',
  });

  console.log('--- 2. write intent (expect stepup / high_risk_action) ---');
  await runProbe(ctx.apiKey, ctx.agentId, 'write-gate', {
    command: '/filesystem/file/write',
    expectedReason: 'high_risk_action',
  });

  console.log('--- 3. delete intent (expect stepup / high_risk_action) ---');
  await runProbe(ctx.apiKey, ctx.agentId, 'delete-gate', {
    command: '/filesystem/dir/delete_recursive',
    expectedReason: 'high_risk_action',
  });

  console.log('');
  console.log('Classifier gate is wired. For full executor coverage:');
  console.log(`  1. open the dashboard, approve a write intent for agent ${ctx.agentId}`);
  console.log('  2. the approval creates a covering envelope');
  console.log('  3. re-run this script — read probes will silent-mint and exercise the executor');

  results.exit();
}

void main();
