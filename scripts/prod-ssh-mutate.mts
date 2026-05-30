#!/usr/bin/env tsx
/**
 * Prod SSH/SFTP/exec mutate harness — exercises the prod broker (Azure
 * VM PDP at pdp.auto-nomos.com) end-to-end for the SSH provider.
 *
 * Flow mirrors prod-fs-mutate:
 *   1. Setup agent + policy + admin api key, set agent mode=dynamic.
 *   2. Mint an intent for [exec, file/write, file/read, dir/list] with
 *      ssh constraint (host, port, username, path_prefix). Step-up via
 *      passkey approval issues a covering envelope + UCAN for /ssh/exec.
 *   3. Three checks against the prod PDP executor:
 *        a. SFTP write+read parity inside the sandbox
 *        b. exec smoke (whoami) — requires cosigner per ssh:exec-step-up
 *           template, so this returns 403 unless the policy is opened up
 *        c. destructive cosigner gate — /ssh/dir/delete_recursive
 *           expects classifier stepup
 *
 * Prereqs (operator must verify):
 *   - prod PDP has SSH_PRIVATE_KEY env set to a key whose pub half is
 *     in authorized_keys on NOMOS_SSH_TARGET_HOST for NOMOS_SSH_TARGET_USER
 *   - NOMOS_SSH_TARGET_SANDBOX path exists + is writable by that user
 *
 * Env:
 *   NOMOS_SESSION_TOKEN         better-auth session cookie value
 *   NOMOS_ORG_ID                customer/org uuid
 *   CONTROL_PLANE_URL           default https://api.auto-nomos.com
 *   PDP_URL                     default https://pdp.auto-nomos.com
 *   NOMOS_APPROVE_WAIT_SEC      default 300
 *   E2E_SSH_AGENT_NAME          default e2e-ssh-mutate
 *   NOMOS_SSH_TARGET_HOST       required — host PDP will connect to
 *   NOMOS_SSH_TARGET_PORT       default 22
 *   NOMOS_SSH_TARGET_USER       default azureuser
 *   NOMOS_SSH_TARGET_SANDBOX    default /tmp/nomos-ssh-mutate
 *
 * Exits 0 only if every check passes.
 */
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
const AGENT_NAME = process.env.E2E_SSH_AGENT_NAME ?? 'e2e-ssh-mutate';
const APPROVE_WAIT_SEC = Number(process.env.NOMOS_APPROVE_WAIT_SEC ?? '300');
const TARGET_HOST = req('NOMOS_SSH_TARGET_HOST');
const TARGET_PORT = Number(process.env.NOMOS_SSH_TARGET_PORT ?? '22');
const TARGET_USER = process.env.NOMOS_SSH_TARGET_USER ?? 'azureuser';
const SANDBOX_PARENT = process.env.NOMOS_SSH_TARGET_SANDBOX ?? '/tmp/nomos-ssh-mutate';
const RUN_ID = `${Date.now()}`;
const SANDBOX = `${SANDBOX_PARENT}/run-${RUN_ID}`;

const ACTIONS = {
  exec: '/ssh/exec',
  write: '/ssh/file/write',
  read: '/ssh/file/read',
  list: '/ssh/dir/list',
  createDir: '/ssh/dir/create',
  deleteRecursive: '/ssh/dir/delete_recursive',
} as const;

const SSH_READ = '[Action::"/ssh/file/read", Action::"/ssh/dir/list", Action::"/ssh/dir/tree"]';
const SSH_WRITE =
  '[Action::"/ssh/file/write", Action::"/ssh/file/create", Action::"/ssh/file/move", Action::"/ssh/file/copy", Action::"/ssh/dir/create"]';
const SSH_DELETE =
  '[Action::"/ssh/file/delete", Action::"/ssh/dir/delete", Action::"/ssh/dir/delete_recursive"]';

// Permissive Cedar — gates are exercised at the classifier (intent) and
// at @stepup attributes for exec + delete.
const CEDAR_POLICY = `permit (principal, action in ${SSH_READ}, resource)
when { context.resource_constraint has "host" };

permit (principal, action in ${SSH_WRITE}, resource)
when { context.resource_constraint has "host" && context.resource_constraint has "path_prefix" };

@stepup("required")
permit (principal, action == Action::"/ssh/exec", resource)
when { context.cosigner == true && context.resource_constraint has "host" };

@stepup("required")
permit (principal, action in ${SSH_DELETE}, resource)
when { context.cosigner == true };`;

const results = new Results();

function sshConstraint(pathPrefix: string): Record<string, unknown> {
  return {
    provider: 'ssh',
    host: TARGET_HOST,
    port: TARGET_PORT,
    username: TARGET_USER,
    path_prefix: pathPrefix,
  };
}

async function setup(): Promise<{ agentId: string; apiKey: string }> {
  console.log('--- Setup ---');
  const ctx = await setupAgent({
    controlPlane: CONTROL_PLANE,
    session: SESSION,
    orgId: ORG_ID,
    agentName: AGENT_NAME,
    policyName: `e2e-ssh-mutate-${AGENT_NAME}`,
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
  const res = await mintIntentUcan({
    controlPlane: CONTROL_PLANE,
    apiKey,
    agentId,
    command,
    constraint: sshConstraint(pathPrefix),
    ttlSeconds: 300,
    purpose: `prod-ssh-mutate ${command}`,
  });
  if (res.kind !== 'mint' || !res.ucan) {
    throw new Error(`intent ${command} not covered (kind=${res.kind}). approve via passkey first.`);
  }
  return res.ucan;
}

async function bootstrapEnvelope(apiKey: string, agentId: string): Promise<boolean> {
  console.log(`--- Bootstrap envelope (passkey approval required) ---`);
  console.log(`  target: ${TARGET_USER}@${TARGET_HOST}:${TARGET_PORT}`);
  console.log(`  sandbox: ${SANDBOX}`);
  try {
    const result = await mintIntentWithApproval({
      controlPlane: CONTROL_PLANE,
      pdp: PDP,
      orgId: ORG_ID,
      apiKey,
      agentId,
      command: ACTIONS.createDir,
      envelopeActions: [ACTIONS.createDir, ACTIONS.write, ACTIONS.read, ACTIONS.list],
      constraint: sshConstraint(SANDBOX_PARENT),
      ttlSeconds: 600,
      purpose: 'prod-ssh-mutate harness bootstrap',
      approveWaitSec: APPROVE_WAIT_SEC,
    });

    const r = await pdpProxy({
      pdp: PDP,
      orgId: ORG_ID,
      command: ACTIONS.createDir,
      ucan: result.ucan,
      apiCall: { method: 'POST', path: '/dir/create', body: { path: SANDBOX } },
    });
    if (r.status === 200) {
      results.pass(
        'bootstrap: ssh mkdir sandbox',
        `envelopeId=${result.envelopeId} ${TARGET_HOST}:${SANDBOX}`,
      );
      return true;
    }
    const b = r.body as { error_code?: string; error?: string };
    results.fail(
      'bootstrap: ssh mkdir sandbox',
      `status=${r.status} err=${b.error_code ?? b.error ?? '?'} body=${JSON.stringify(r.body).slice(0, 400)}`,
    );
    return false;
  } catch (err) {
    results.fail('bootstrap: envelope mint', (err as Error).message);
    return false;
  }
}

async function caseSftpRoundtrip(apiKey: string, agentId: string): Promise<void> {
  console.log('--- 1. SFTP write+read parity ---');
  const probePath = `${SANDBOX}/probe-${RUN_ID}.txt`;
  const probeContent = `ssh-hello-${RUN_ID}`;
  try {
    const wUcan = await mintCovered(apiKey, agentId, ACTIONS.write, SANDBOX_PARENT);
    const w = await pdpProxy({
      pdp: PDP,
      orgId: ORG_ID,
      command: ACTIONS.write,
      ucan: wUcan,
      apiCall: {
        method: 'POST',
        path: '/file/write',
        body: { path: probePath, content: probeContent },
      },
    });
    if (w.status !== 200) {
      results.fail(
        'sftp-roundtrip: write probe',
        `status=${w.status} body=${JSON.stringify(w.body).slice(0, 400)}`,
      );
      return;
    }

    const rUcan = await mintCovered(apiKey, agentId, ACTIONS.read, SANDBOX_PARENT);
    const r = await pdpProxy({
      pdp: PDP,
      orgId: ORG_ID,
      command: ACTIONS.read,
      ucan: rUcan,
      apiCall: { method: 'GET', path: '/file/read', query: { path: probePath } },
    });
    const body = r.body as { upstream?: { body?: { content?: string } } };
    const read = body.upstream?.body?.content;
    if (r.status === 200 && read === probeContent) {
      results.pass('sftp-roundtrip: probe round-trip', `bytes=${read?.length}`);
    } else {
      results.fail(
        'sftp-roundtrip: probe round-trip',
        `status=${r.status} read=${read ?? '<missing>'} expected=${probeContent}`,
      );
    }
  } catch (err) {
    results.fail('sftp-roundtrip', (err as Error).message);
  }
}

async function caseExecCosignerGate(apiKey: string, agentId: string): Promise<void> {
  console.log('--- 2. exec cosigner gate (classifier stepup) ---');
  try {
    const res = await mintIntentUcan({
      controlPlane: CONTROL_PLANE,
      apiKey,
      agentId,
      command: ACTIONS.exec,
      constraint: sshConstraint(SANDBOX_PARENT),
      ttlSeconds: 300,
      purpose: 'prod-ssh-mutate exec probe',
    });
    if (res.kind === 'stepup') {
      results.pass(
        'exec-gate: classifier stepup',
        `stepUpId=${(res.raw as { stepUpId?: string }).stepUpId ?? '?'}`,
      );
      return;
    }
    if (res.kind === 'mint' && res.ucan) {
      const r = await pdpProxy({
        pdp: PDP,
        orgId: ORG_ID,
        command: ACTIONS.exec,
        ucan: res.ucan,
        apiCall: { method: 'POST', path: '/exec', body: { command: 'whoami' } },
      });
      const b = r.body as { error_code?: string };
      if (r.status === 403 && b.error_code === 'cosigner_required') {
        results.pass('exec-gate: cedar 403 cosigner_required', '');
      } else {
        results.fail(
          'exec-gate',
          `status=${r.status} body=${JSON.stringify(r.body).slice(0, 400)}`,
        );
      }
      return;
    }
    results.fail('exec-gate', `unexpected intent kind=${res.kind}`);
  } catch (err) {
    results.fail('exec-gate', (err as Error).message);
  }
}

async function caseDeleteCosignerGate(apiKey: string, agentId: string): Promise<void> {
  console.log('--- 3. destructive cosigner gate (classifier stepup) ---');
  try {
    const res = await mintIntentUcan({
      controlPlane: CONTROL_PLANE,
      apiKey,
      agentId,
      command: ACTIONS.deleteRecursive,
      constraint: sshConstraint(SANDBOX_PARENT),
      ttlSeconds: 300,
      purpose: 'prod-ssh-mutate destructive probe',
    });
    if (res.kind === 'stepup') {
      results.pass(
        'delete-gate: classifier stepup',
        `stepUpId=${(res.raw as { stepUpId?: string }).stepUpId ?? '?'}`,
      );
      return;
    }
    if (res.kind === 'mint' && res.ucan) {
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
          'delete-gate',
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
  console.log(`AGENT=${AGENT_NAME}  SSH=${TARGET_USER}@${TARGET_HOST}:${TARGET_PORT}`);
  console.log(`SANDBOX_PARENT=${SANDBOX_PARENT}  SANDBOX=${SANDBOX}`);
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
    console.log('\nbootstrap failed — check SSH_PRIVATE_KEY env on prod PDP +');
    console.log(`authorized_keys for ${TARGET_USER}@${TARGET_HOST}`);
    results.exit();
  }

  await caseSftpRoundtrip(ctx.apiKey, ctx.agentId);
  await caseExecCosignerGate(ctx.apiKey, ctx.agentId);
  await caseDeleteCosignerGate(ctx.apiKey, ctx.agentId);

  console.log('');
  console.log(`leftover on ${TARGET_HOST}: ${SANDBOX}`);
  console.log(`manual cleanup: ssh ${TARGET_USER}@${TARGET_HOST} 'rm -rf ${SANDBOX}'`);

  results.exit();
}

void main();
