#!/usr/bin/env tsx
/**
 * Local SSH/SFTP/exec mutate harness — mirrors prod-fs-mutate but targets
 * the local docker stack PDP and the openssh-server container booted
 * from infrastructure/docker/docker-compose.ssh-test.yml.
 *
 * Three checks:
 *   1. SFTP write+read parity — write probe via /ssh/file/write, read it
 *      back via /ssh/file/read inside the sandbox.
 *   2. exec cosigner gate — /ssh/exec without cosigner UCAN must come back
 *      403 cosigner_required (template `ssh:exec-step-up`).
 *   3. destructive cosigner gate — /ssh/dir/delete_recursive without
 *      cosigner must come back 403 cosigner_required.
 *
 * Prereqs (run once):
 *   ./scripts/setup-ssh-test-fixture.sh   # generates key + sandbox dir
 *   pnpm dev:up:detach                     # postgres + pdp + control-plane
 *   pnpm test:local:ssh:up                 # boots cb-test-sshd
 *
 * Env (loaded from .env.local; setup-ssh-test-fixture.sh writes most):
 *   NOMOS_SESSION_TOKEN  better-auth session cookie value (dev login)
 *   NOMOS_ORG_ID         org uuid of the dev account
 *   PDP_URL              default http://localhost:8787
 *   CONTROL_PLANE_URL    default http://localhost:8788
 *   SSH_TEST_HOST        default test-sshd (in-network) — set to
 *                        127.0.0.1 if running PDP on the host
 *   SSH_TEST_PORT        default 2222
 *   SSH_TEST_USER        default nomos
 *   SSH_TEST_SANDBOX     default /sandbox/writable
 *
 * Exits 0 only if every check passes.
 */
import {
  Results,
  mintIntentUcan,
  pdpProxy,
  req,
  setAgentMode,
  setupAgent,
} from './lib-prod-harness.mts';

const CONTROL_PLANE = (process.env.CONTROL_PLANE_URL ?? 'http://localhost:8788').replace(
  /\/+$/,
  '',
);
const PDP = (process.env.PDP_URL ?? 'http://localhost:8787').replace(/\/+$/, '');

const SESSION = req('NOMOS_SESSION_TOKEN');
const ORG_ID = req('NOMOS_ORG_ID');
const AGENT_NAME = process.env.E2E_SSH_AGENT_NAME ?? 'e2e-ssh-mutate';

// Default to in-network DNS name — PDP container resolves `test-sshd` via
// shared docker network. Override to 127.0.0.1 when PDP runs on the host.
const SSH_HOST = process.env.SSH_TEST_HOST ?? 'test-sshd';
const SSH_PORT = Number(process.env.SSH_TEST_PORT ?? '2222');
const SSH_USER = process.env.SSH_TEST_USER ?? 'nomos';
const SANDBOX = process.env.SSH_TEST_SANDBOX ?? '/sandbox/writable';
const RUN_ID = `${Date.now()}`;

const SSH_READ_ACTIONS =
  '[Action::"/ssh/file/read", Action::"/ssh/dir/list", Action::"/ssh/dir/tree"]';
const SSH_WRITE_ACTIONS =
  '[Action::"/ssh/file/write", Action::"/ssh/file/create", Action::"/ssh/file/move", Action::"/ssh/file/copy", Action::"/ssh/dir/create"]';
const SSH_DELETE_ACTIONS =
  '[Action::"/ssh/file/delete", Action::"/ssh/dir/delete", Action::"/ssh/dir/delete_recursive"]';

// Allow all read+write freely; exec + delete both require a passkey
// cosigner. The script verifies the gate fires; an automated cosigner
// approval is out of scope (same as prod-azure-mutate).
const CEDAR_POLICY = `permit (
  principal,
  action in ${SSH_READ_ACTIONS},
  resource
)
when { context.resource_constraint has "host" };

permit (
  principal,
  action in ${SSH_WRITE_ACTIONS},
  resource
)
when { context.resource_constraint has "host" && context.resource_constraint has "path_prefix" };

@stepup("required")
permit (
  principal,
  action == Action::"/ssh/exec",
  resource
)
when { context.cosigner == true && context.resource_constraint has "host" };

@stepup("required")
permit (
  principal,
  action in ${SSH_DELETE_ACTIONS},
  resource
)
when { context.cosigner == true };`;

const results = new Results();

interface SshConstraintInput {
  host: string;
  port: number;
  username: string;
  path_prefix?: string;
}

function sshConstraint(extra: Partial<SshConstraintInput> = {}): Record<string, unknown> {
  return {
    provider: 'ssh',
    host: extra.host ?? SSH_HOST,
    port: extra.port ?? SSH_PORT,
    username: extra.username ?? SSH_USER,
    ...(extra.path_prefix !== undefined ? { path_prefix: extra.path_prefix } : { path_prefix: SANDBOX }),
  };
}

async function mintFor(
  apiKey: string,
  agentId: string,
  command: string,
  constraint: Record<string, unknown>,
  purpose: string,
): Promise<string> {
  const res = await mintIntentUcan({
    controlPlane: CONTROL_PLANE,
    apiKey,
    agentId,
    command,
    constraint,
    ttlSeconds: 300,
    purpose,
  });
  if (res.kind !== 'mint' || !res.ucan) {
    throw new Error(
      `intent ${command} returned kind=${res.kind} raw=${JSON.stringify(res.raw).slice(0, 300)}`,
    );
  }
  return res.ucan;
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

async function caseSftpRoundtrip(apiKey: string, agentId: string): Promise<void> {
  console.log('--- 1. SFTP write+read parity ---');
  const writeUcan = await mintFor(
    apiKey,
    agentId,
    '/ssh/file/write',
    sshConstraint(),
    'ssh round-trip write',
  );
  const probePath = `${SANDBOX}/probe-${RUN_ID}.txt`;
  const probeContent = `ssh-hello-${RUN_ID}`;
  const w = await pdpProxy({
    pdp: PDP,
    orgId: ORG_ID,
    command: '/ssh/file/write',
    ucan: writeUcan,
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

  const readUcan = await mintFor(
    apiKey,
    agentId,
    '/ssh/file/read',
    sshConstraint(),
    'ssh round-trip read',
  );
  const r = await pdpProxy({
    pdp: PDP,
    orgId: ORG_ID,
    command: '/ssh/file/read',
    ucan: readUcan,
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
}

async function caseExecCosignerGate(apiKey: string, agentId: string): Promise<void> {
  console.log('--- 2. exec cosigner gate ---');
  const ucan = await mintFor(
    apiKey,
    agentId,
    '/ssh/exec',
    sshConstraint(),
    'whoami probe (should be gated)',
  );
  const r = await pdpProxy({
    pdp: PDP,
    orgId: ORG_ID,
    command: '/ssh/exec',
    ucan,
    apiCall: { method: 'POST', path: '/exec', body: { command: 'whoami' } },
  });
  const b = r.body as { error_code?: string; decision?: { reason?: string } };
  if (r.status === 403 && b.error_code === 'cosigner_required') {
    results.pass('exec-gate: 403 cosigner_required', b.decision?.reason ?? '?');
  } else {
    results.fail(
      'exec-gate: expected 403 cosigner_required',
      `status=${r.status} body=${JSON.stringify(r.body).slice(0, 400)}`,
    );
  }
}

async function caseDeleteCosignerGate(apiKey: string, agentId: string): Promise<void> {
  console.log('--- 3. destructive cosigner gate ---');
  const ucan = await mintFor(
    apiKey,
    agentId,
    '/ssh/dir/delete_recursive',
    sshConstraint(),
    'rm -rf sandbox (should be gated)',
  );
  const r = await pdpProxy({
    pdp: PDP,
    orgId: ORG_ID,
    command: '/ssh/dir/delete_recursive',
    ucan,
    apiCall: {
      method: 'DELETE',
      path: '/dir/delete_recursive',
      body: { path: SANDBOX },
    },
  });
  const b = r.body as { error_code?: string; decision?: { reason?: string } };
  if (r.status === 403 && b.error_code === 'cosigner_required') {
    results.pass('delete-gate: 403 cosigner_required', b.decision?.reason ?? '?');
  } else {
    results.fail(
      'delete-gate: expected 403 cosigner_required',
      `status=${r.status} body=${JSON.stringify(r.body).slice(0, 400)}`,
    );
  }
}

async function preflight(): Promise<void> {
  // Cheap visibility check from this script's POV — the PDP runs in a
  // container so its reachability to test-sshd is what actually matters,
  // but if the host port is closed the whole stack is wrong.
  const url = `http://${SSH_HOST === 'test-sshd' ? '127.0.0.1' : SSH_HOST}:${SSH_PORT}`;
  try {
    // SSH is not HTTP; we expect this to fail. Connection-refused →
    // sshd not up. Anything else (timeout, EPROTO) means the port is
    // listening.
    await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(2000) }).catch(() => {});
  } catch {
    // ignore
  }
}

async function main(): Promise<void> {
  console.log(`CONTROL_PLANE=${CONTROL_PLANE}  PDP=${PDP}  ORG=${ORG_ID}`);
  console.log(`SSH host=${SSH_HOST}:${SSH_PORT} user=${SSH_USER} sandbox=${SANDBOX}`);
  console.log('');

  await preflight();

  let ctx: { agentId: string; apiKey: string };
  try {
    ctx = await setup();
  } catch (err) {
    console.error(`SETUP FAILED: ${(err as Error).message}`);
    process.exit(2);
  }

  await caseSftpRoundtrip(ctx.apiKey, ctx.agentId);
  await caseExecCosignerGate(ctx.apiKey, ctx.agentId);
  await caseDeleteCosignerGate(ctx.apiKey, ctx.agentId);

  results.exit();
}

void main();
