#!/usr/bin/env tsx
/**
 * Prod filesystem mutate harness — exercises the prod broker (Azure VM
 * PDP at pdp.auto-nomos.com) end-to-end for the local-filesystem provider.
 *
 * Flow:
 *   1. Setup an e2e agent + permissive Cedar policy + admin api key.
 *   2. Toggle agent to dynamic mode (required for /v1/intent).
 *   3. Mint an intent for the full action set (create_dir, file/write,
 *      file/read, file/copy) with constraint path_prefix=/tmp. /v1/intent
 *      returns kind=stepup; the harness prints the dashboard approval URL
 *      and polls PDP /v1/stepup/:id until the operator approves via
 *      passkey. After approval the broker creates a covering envelope and
 *      mints a UCAN for the first action.
 *   4. Drive the four executor checks under the covered envelope:
 *        a. create_dir bootstraps /tmp/nomos-fs-mutate-<runId>
 *        b. /file/write writes a probe, /file/read reads it back
 *        c. /file/copy copies the probe inside the sandbox
 *        d. /dir/delete_recursive on the sandbox WITHOUT cosigner —
 *           expects 403 cosigner_required (cedar @stepup attribute
 *           fires regardless of envelope coverage).
 *
 * Env:
 *   NOMOS_SESSION_TOKEN     better-auth session cookie value
 *   NOMOS_ORG_ID            customer/org uuid
 *   CONTROL_PLANE_URL       default https://api.auto-nomos.com
 *   PDP_URL                 default https://pdp.auto-nomos.com
 *   NOMOS_APPROVE_WAIT_SEC  default 300 (5 min for the passkey click)
 *   E2E_FS_AGENT_NAME       default e2e-fs-mutate
 *   NOMOS_FS_SANDBOX_PARENT default /tmp  (must exist on the VM disk)
 *
 * Exits 0 only if every check passes.
 */
import * as path from 'node:path';
import {
  CONTROL_PLANE,
  mintIntentUcan,
  mintIntentWithApproval,
  PDP,
  pdpProxy,
  Results,
  req,
  setAgentMode,
  setupAgent,
} from './lib-prod-harness.mts';

const SESSION = req('NOMOS_SESSION_TOKEN');
const ORG_ID = req('NOMOS_ORG_ID');
const AGENT_NAME = process.env.E2E_FS_AGENT_NAME ?? 'e2e-fs-mutate';
const APPROVE_WAIT_SEC = Number(process.env.NOMOS_APPROVE_WAIT_SEC ?? '300');
const SANDBOX_PARENT = process.env.NOMOS_FS_SANDBOX_PARENT ?? '/tmp';
const RUN_ID = `${Date.now()}`;
const SANDBOX = path.posix.join(SANDBOX_PARENT, `nomos-fs-mutate-${RUN_ID}`);

const ACTIONS = {
  createDir: '/filesystem/dir/create',
  write: '/filesystem/file/write',
  read: '/filesystem/file/read',
  copy: '/filesystem/file/copy',
  list: '/filesystem/dir/list',
  deleteRecursive: '/filesystem/dir/delete_recursive',
} as const;

const FS_READ_ACTIONS =
  '[Action::"/filesystem/file/read", Action::"/filesystem/dir/list", Action::"/filesystem/dir/tree"]';
const FS_WRITE_ACTIONS =
  '[Action::"/filesystem/file/write", Action::"/filesystem/file/create", Action::"/filesystem/file/move", Action::"/filesystem/file/copy", Action::"/filesystem/dir/create"]';
const FS_DELETE_ACTIONS =
  '[Action::"/filesystem/file/delete", Action::"/filesystem/dir/delete", Action::"/filesystem/dir/delete_recursive"]';

const CEDAR_POLICY = `permit (principal, action in ${FS_READ_ACTIONS}, resource);
permit (principal, action in ${FS_WRITE_ACTIONS}, resource);
@stepup("required")
permit (principal, action in ${FS_DELETE_ACTIONS}, resource)
when { context.cosigner == true };`;

const results = new Results();
let SANDBOX_BOOTSTRAPPED = false;

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

async function mintCovered(
  apiKey: string,
  agentId: string,
  command: string,
  pathPrefix: string,
): Promise<string> {
  // Mint inside an existing envelope. Read/list/tree silent-mint without
  // step-up because they aren't in HIGH_RISK_VERBS; writes/creates need
  // the prior envelope from the passkey-approved bootstrap.
  const res = await mintIntentUcan({
    controlPlane: CONTROL_PLANE,
    apiKey,
    agentId,
    command,
    constraint: { provider: 'filesystem', path_prefix: pathPrefix },
    ttlSeconds: 300,
    purpose: `prod-fs-mutate ${command}`,
  });
  if (res.kind !== 'mint' || !res.ucan) {
    throw new Error(`intent ${command} not covered (kind=${res.kind}). approve via passkey first.`);
  }
  return res.ucan;
}

async function bootstrapEnvelope(apiKey: string, agentId: string): Promise<boolean> {
  console.log(`--- Bootstrap envelope (passkey approval required) ---`);
  console.log(`  sandbox parent: ${SANDBOX_PARENT}`);
  console.log(`  sandbox dir:    ${SANDBOX}`);
  try {
    const result = await mintIntentWithApproval({
      controlPlane: CONTROL_PLANE,
      pdp: PDP,
      orgId: ORG_ID,
      apiKey,
      agentId,
      command: ACTIONS.createDir,
      // All actions that the envelope must cover for the harness to
      // silent-mint the rest. Step-up classifier doesn't include 'list'
      // in HIGH_RISK_VERBS so we omit it (reads silent-mint anyway).
      envelopeActions: [ACTIONS.createDir, ACTIONS.write, ACTIONS.read, ACTIONS.copy, ACTIONS.list],
      constraint: { provider: 'filesystem', path_prefix: SANDBOX_PARENT },
      ttlSeconds: 600,
      purpose: 'prod-fs-mutate harness bootstrap',
      approveWaitSec: APPROVE_WAIT_SEC,
    });

    // Use the bootstrap UCAN to actually create the sandbox dir.
    const r = await pdpProxy({
      pdp: PDP,
      orgId: ORG_ID,
      command: ACTIONS.createDir,
      ucan: result.ucan,
      apiCall: { method: 'POST', path: '/dir/create', body: { path: SANDBOX } },
    });
    if (r.status === 200) {
      results.pass('bootstrap: create sandbox dir', `envelopeId=${result.envelopeId} ${SANDBOX}`);
      SANDBOX_BOOTSTRAPPED = true;
      return true;
    }
    results.fail(
      'bootstrap: create sandbox dir',
      `status=${r.status} body=${JSON.stringify(r.body).slice(0, 400)}`,
    );
    return false;
  } catch (err) {
    results.fail('bootstrap: envelope mint', (err as Error).message);
    return false;
  }
}

async function caseReadParity(apiKey: string, agentId: string): Promise<void> {
  console.log('--- 1. read parity (write probe + read back) ---');
  const probePath = `${SANDBOX}/probe.txt`;
  const probeContent = `hello-fs-${RUN_ID}`;
  try {
    const writeUcan = await mintCovered(apiKey, agentId, ACTIONS.write, SANDBOX_PARENT);
    const w = await pdpProxy({
      pdp: PDP,
      orgId: ORG_ID,
      command: ACTIONS.write,
      ucan: writeUcan,
      apiCall: {
        method: 'POST',
        path: '/file/write',
        body: { path: probePath, content: probeContent },
      },
    });
    if (w.status !== 200) {
      results.fail(
        'read-parity: write probe',
        `status=${w.status} body=${JSON.stringify(w.body).slice(0, 400)}`,
      );
      return;
    }

    const readUcan = await mintCovered(apiKey, agentId, ACTIONS.read, SANDBOX_PARENT);
    const r = await pdpProxy({
      pdp: PDP,
      orgId: ORG_ID,
      command: ACTIONS.read,
      ucan: readUcan,
      apiCall: { method: 'GET', path: '/file/read', query: { path: probePath } },
    });
    const body = r.body as { upstream?: { body?: { content?: string } } };
    const read = body.upstream?.body?.content;
    if (r.status === 200 && read === probeContent) {
      results.pass('read-parity: probe round-trip', `bytes=${read?.length}`);
    } else {
      results.fail(
        'read-parity: probe round-trip',
        `status=${r.status} read=${read ?? '<missing>'} expected=${probeContent}`,
      );
    }
  } catch (err) {
    results.fail('read-parity', (err as Error).message);
  }
}

async function caseCopyParity(apiKey: string, agentId: string): Promise<void> {
  console.log('--- 2. write parity (copy + list) ---');
  try {
    const ucan = await mintCovered(apiKey, agentId, ACTIONS.copy, SANDBOX_PARENT);
    const src = `${SANDBOX}/probe.txt`;
    const dst = `${SANDBOX}/probe-copy.txt`;
    const cp = await pdpProxy({
      pdp: PDP,
      orgId: ORG_ID,
      command: ACTIONS.copy,
      ucan,
      apiCall: { method: 'POST', path: '/file/copy', body: { path: src, destination: dst } },
    });
    if (cp.status !== 200) {
      results.fail(
        'copy-parity: copy',
        `status=${cp.status} body=${JSON.stringify(cp.body).slice(0, 400)}`,
      );
      return;
    }

    const listUcan = await mintCovered(apiKey, agentId, ACTIONS.list, SANDBOX_PARENT);
    const ls = await pdpProxy({
      pdp: PDP,
      orgId: ORG_ID,
      command: ACTIONS.list,
      ucan: listUcan,
      apiCall: { method: 'GET', path: '/dir/list', query: { path: SANDBOX } },
    });
    const lsBody = ls.body as { upstream?: { body?: { entries?: Array<{ name: string }> } } };
    const names = lsBody.upstream?.body?.entries?.map((e) => e.name) ?? [];
    if (ls.status === 200 && names.includes('probe.txt') && names.includes('probe-copy.txt')) {
      results.pass('copy-parity: copy + list', `entries=[${names.join(',')}]`);
    } else {
      results.fail('copy-parity: copy + list', `status=${ls.status} entries=${names.join(',')}`);
    }
  } catch (err) {
    results.fail('copy-parity', (err as Error).message);
  }
}

async function caseDeleteCosignerGate(apiKey: string, agentId: string): Promise<void> {
  console.log('--- 3. destructive cosigner gate ---');
  try {
    // For deletes the cedar @stepup attribute fires regardless of
    // envelope coverage. The intent classifier ALSO sends delete verbs
    // through step-up — so the first /v1/intent for delete returns
    // kind=stepup, NOT a covered UCAN. That itself is the gate fire.
    const res = await mintIntentUcan({
      controlPlane: CONTROL_PLANE,
      apiKey,
      agentId,
      command: ACTIONS.deleteRecursive,
      constraint: { provider: 'filesystem', path_prefix: SANDBOX_PARENT },
      ttlSeconds: 300,
      purpose: 'prod-fs-mutate destructive probe',
    });
    if (res.kind === 'stepup') {
      results.pass(
        'delete-gate: classifier stepup',
        `stepUpId=${(res.raw as { stepUpId?: string }).stepUpId ?? '?'}`,
      );
      return;
    }
    if (res.kind === 'mint' && res.ucan) {
      // Should not happen for a delete verb, but exercise the cedar
      // @stepup gate just in case the classifier ever relaxes.
      const r = await pdpProxy({
        pdp: PDP,
        orgId: ORG_ID,
        command: ACTIONS.deleteRecursive,
        ucan: res.ucan,
        apiCall: { method: 'DELETE', path: '/dir/delete_recursive', body: { path: SANDBOX } },
      });
      const b = r.body as { error_code?: string };
      if (r.status === 403 && b.error_code === 'cosigner_required') {
        results.pass('delete-gate: cedar 403 cosigner_required', '');
      } else {
        results.fail(
          'delete-gate: cedar gate',
          `status=${r.status} body=${JSON.stringify(r.body).slice(0, 400)}`,
        );
      }
      return;
    }
    results.fail('delete-gate', `unexpected intent kind=${res.kind}`);
  } catch (err) {
    results.fail('delete-gate', (err as Error).message);
  }
}

async function main(): Promise<void> {
  console.log(`CONTROL_PLANE=${CONTROL_PLANE}  PDP=${PDP}  ORG=${ORG_ID}`);
  console.log(`AGENT=${AGENT_NAME}  SANDBOX=${SANDBOX}`);
  console.log(`APPROVE_WAIT_SEC=${APPROVE_WAIT_SEC}`);
  console.log('');

  let ctx: { agentId: string; apiKey: string };
  try {
    ctx = await setup();
  } catch (err) {
    console.error(`SETUP FAILED: ${(err as Error).message}`);
    process.exit(2);
  }
  results.pass('setup: agent + policy + api key minted', `agentId=${ctx.agentId}`);

  const ok = await bootstrapEnvelope(ctx.apiKey, ctx.agentId);
  if (!ok) {
    console.log(`\nbootstrap failed — sandbox dir may already exist or VM /tmp not writable`);
    results.exit();
  }

  await caseReadParity(ctx.apiKey, ctx.agentId);
  await caseCopyParity(ctx.apiKey, ctx.agentId);
  await caseDeleteCosignerGate(ctx.apiKey, ctx.agentId);

  if (SANDBOX_BOOTSTRAPPED) {
    console.log('');
    console.log(`leftover sandbox on VM: ${SANDBOX}`);
    console.log(`manual cleanup: ssh azureuser@nomos-vm 'rm -rf ${SANDBOX}'`);
  }

  results.exit();
}

void main();
