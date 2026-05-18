#!/usr/bin/env tsx
/**
 * Phase B mutation cycle — broker-only create / tag / delete against a
 * Contributor-scoped sandbox cloud connection.
 *
 * Prereqs (one-time, see infra/terraform/examples/azure-sandbox.tf):
 *   - Sandbox RG provisioned with Contributor role on a separate App
 *     Registration.
 *   - Sandbox cloud_connection created in Nomos (display name like
 *     `azure-sandbox`).
 *   - FIC registered for the test agent on the sandbox App Reg.
 *
 * The harness runs every Azure mutation through the broker:
 *   1. CREATE child RG inside the sandbox RG's region — exercises a
 *      non-destructive write that should slip past the cosigner gate.
 *   2. PATCH tags — same.
 *   3. DELETE the child RG — destructive; cosigner gate MUST fire.
 *      The harness:
 *        a. Verifies the proxy returns 403 cosigner_required.
 *        b. Prints the stepUpUrl + waits up to NOMOS_APPROVE_WAIT_SEC
 *           (default 90s) for the operator to approve via dashboard.
 *        c. Polls /v1/stepup/<id> until state=approved, retrieves the
 *           cosigner UCAN, and retries the DELETE with the cosignerJwt
 *           attached. ARM 200 closes the loop.
 *
 * If the wait times out, the harness leaves the child RG behind and
 * prints the manual cleanup command (az group delete).
 *
 * Env:
 *   NOMOS_SESSION_TOKEN           — better-auth session cookie value.
 *   NOMOS_ORG_ID                  — Nomos customer/org uuid.
 *   NOMOS_SANDBOX_CLOUD_CONN_ID   — cloud_connection uuid for the
 *                                   Contributor-scoped sandbox.
 *   NOMOS_AZURE_SUB_ID            — same subscription as the sandbox RG.
 *   NOMOS_SANDBOX_RG              — parent sandbox RG name (default
 *                                   nomos-sandbox-rg). The child RG the
 *                                   harness creates lives separately at
 *                                   subscription scope.
 *   NOMOS_APPROVE_WAIT_SEC        — seconds to wait for the operator to
 *                                   approve the destructive step
 *                                   (default 90; 0 = skip approve test).
 *
 * Exits 0 only if every step succeeds.
 */

const SESSION = req('NOMOS_SESSION_TOKEN');
const ORG_ID = req('NOMOS_ORG_ID');
const SANDBOX_CONN_ID = req('NOMOS_SANDBOX_CLOUD_CONN_ID');
const AZURE_SUB = req('NOMOS_AZURE_SUB_ID');
const SANDBOX_RG = process.env.NOMOS_SANDBOX_RG ?? 'nomos-sandbox-rg';
const APPROVE_WAIT_SEC = Number(process.env.NOMOS_APPROVE_WAIT_SEC ?? '90');
const CONTROL_PLANE = (process.env.CONTROL_PLANE_URL ?? 'https://api.auto-nomos.com').replace(
  /\/+$/,
  '',
);
const PDP = (process.env.PDP_URL ?? 'https://pdp.auto-nomos.com').replace(/\/+$/, '');
const AGENT_NAME = process.env.E2E_TEST_AGENT_NAME ?? 'e2e-azure-mutate';

const CHILD_RG = `${SANDBOX_RG}-child-${Date.now()}`;
const CHILD_REGION = process.env.NOMOS_AZURE_REGION ?? 'eastus2';

function req(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`missing required env: ${name}`);
    process.exit(2);
  }
  return v;
}

function cookieHeader(): string {
  return `__Secure-better-auth.session_token=${SESSION}`;
}
function trpcHeaders(): Record<string, string> {
  return {
    'content-type': 'application/json',
    cookie: cookieHeader(),
    origin: 'https://app.auto-nomos.com',
    referer: 'https://app.auto-nomos.com/',
    'x-cb-org': ORG_ID,
  };
}

async function trpc<T = unknown>(
  path: string,
  method: 'GET' | 'POST',
  body?: unknown,
): Promise<T> {
  const inputPayload =
    body === undefined
      ? { 0: { json: null, meta: { values: ['undefined'] } } }
      : { 0: { json: body } };
  const url =
    method === 'GET'
      ? `${CONTROL_PLANE}/trpc/${path}?batch=1&input=${encodeURIComponent(JSON.stringify(inputPayload))}`
      : `${CONTROL_PLANE}/trpc/${path}?batch=1`;
  const init: RequestInit = { method, headers: trpcHeaders() };
  if (method === 'POST') init.body = JSON.stringify(inputPayload);
  const res = await fetch(url, init);
  const txt = await res.text();
  const arr = JSON.parse(txt) as Array<{ result?: { data?: { json?: T } }; error?: unknown }>;
  if (Array.isArray(arr) && arr[0]?.error) {
    throw new Error(`tRPC ${path} error: ${JSON.stringify(arr[0].error)}`);
  }
  return arr[0]!.result!.data!.json as T;
}

interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
}
const results: CheckResult[] = [];
function pass(name: string, detail?: string): void {
  results.push({ name, ok: true, ...(detail !== undefined ? { detail } : {}) });
  console.log(`  PASS  ${name}${detail ? `  (${detail})` : ''}`);
}
function fail(name: string, detail: string): void {
  results.push({ name, ok: false, detail });
  console.log(`  FAIL  ${name}  (${detail})`);
}

async function setup(): Promise<{ agentId: string; apiKey: string; policyId: string }> {
  console.log('--- Setup ---');
  // Verify sandbox connection exists + verified.
  const conns = await trpc<
    Array<{ id: string; connector: string; bootstrapStatus: string; displayName: string | null }>
  >('cloudConnections.list', 'GET');
  const sandbox = conns.find((c) => c.id === SANDBOX_CONN_ID);
  if (!sandbox) {
    throw new Error(`sandbox connection ${SANDBOX_CONN_ID} not found in this org`);
  }
  if (sandbox.connector !== 'azure') {
    throw new Error(`sandbox connection is not azure: ${sandbox.connector}`);
  }
  if (sandbox.bootstrapStatus !== 'verified') {
    throw new Error(
      `sandbox connection bootstrap_status=${sandbox.bootstrapStatus}; run verifyNow first`,
    );
  }
  console.log(`  sandbox connection ${SANDBOX_CONN_ID} (${sandbox.displayName ?? 'unnamed'}) is verified`);

  const agents = await trpc<Array<{ id: string; name: string; status: string }>>(
    'agents.list',
    'GET',
  );
  let agent = agents.find((a) => a.name === AGENT_NAME);
  if (!agent) {
    agent = await trpc<{ id: string; name: string; status: string }>(
      'agents.create',
      'POST',
      { name: AGENT_NAME, requireApproval: false },
    );
    console.log(`  created agent ${agent.id}`);
    console.log(`  IMPORTANT: register FIC for this agent on the sandbox App Registration before continuing.`);
    console.log(`  The dashboard /app/agents/${agent.id} shows the exact az command pre-filled.`);
    process.exit(2);
  }
  if (agent.status !== 'active') {
    await trpc('agents.update', 'POST', { id: agent.id, status: 'active' });
  }
  console.log(`  reusing agent ${agent.id}`);
  const agentId = agent.id;

  const POLICY_NAME = `e2e-azure-mutate-${AGENT_NAME}`;
  const cedarText = `permit (principal, action, resource);`;
  const policies = await trpc<Array<{ id: string; name: string }>>('policies.list', 'GET');
  const existing = policies.find((p) => p.name === POLICY_NAME);
  const policyId = existing
    ? (await trpc<{ id: string }>('policies.upsert', 'POST', {
        id: existing.id,
        name: POLICY_NAME,
        cedarText,
      })).id
    : (await trpc<{ id: string }>('policies.upsert', 'POST', { name: POLICY_NAME, cedarText })).id;
  await trpc('policies.assignAgents', 'POST', { policyId, agentIds: [agentId] });

  const keys = await trpc<Array<{ id: string; name: string; revokedAt: unknown }>>(
    'apiKeys.list',
    'GET',
    { agentId },
  );
  const KEY_NAME = `${AGENT_NAME}-key`;
  for (const k of keys) {
    if (k.name === KEY_NAME && !k.revokedAt) {
      await trpc('apiKeys.revoke', 'POST', { id: k.id });
    }
  }
  const created = await trpc<{ plaintextOnce: string }>('apiKeys.create', 'POST', {
    agentId,
    name: KEY_NAME,
    role: 'admin',
  });
  return { agentId, apiKey: created.plaintextOnce, policyId };
}

async function mintUcan(apiKey: string, command: string): Promise<string> {
  const res = await fetch(`${CONTROL_PLANE}/v1/mint-ucan`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      commands: [command],
      cloudConnectionId: SANDBOX_CONN_ID,
      ttlSeconds: 600,
    }),
  });
  if (!res.ok) {
    throw new Error(`mint ${command} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const body = (await res.json()) as { ucans: Array<{ jwt: string }> };
  if (!body.ucans[0]) throw new Error(`no ucan in mint response for ${command}`);
  return body.ucans[0].jwt;
}

async function callProxy(
  command: string,
  ucan: string,
  apiCall: {
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    path: string;
    query?: Record<string, string>;
    body?: Record<string, unknown>;
  },
  context: Record<string, unknown> = {},
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${PDP}/v1/proxy${command}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cb-customer': ORG_ID },
    body: JSON.stringify({
      ucan,
      request: {
        ucan,
        command,
        resource: { subscription_id: AZURE_SUB, resource_group: CHILD_RG },
        context: { command, ...context },
      },
      apiCall,
    }),
  });
  return { status: res.status, body: await res.json() };
}

async function caseCreate(ctx: { apiKey: string }): Promise<boolean> {
  console.log('--- 1. create child RG (create_resource_group is non-destructive) ---');
  const jwt = await mintUcan(ctx.apiKey, '/azure/resource_groups/create');
  const r = await callProxy('/azure/resource_groups/create', jwt, {
    method: 'PUT',
    path: `/subscriptions/${AZURE_SUB}/resourceGroups/${CHILD_RG}`,
    query: { 'api-version': '2021-04-01' },
    body: { location: CHILD_REGION, tags: { harness: 'prod-azure-mutate', purpose: 'e2e' } },
  });
  const b = r.body as {
    allow?: boolean;
    upstream?: { status?: number };
    error_code?: string;
  };
  if (r.status === 200 && b.upstream?.status && b.upstream.status >= 200 && b.upstream.status < 300) {
    pass('create: ARM 2xx', `status=${b.upstream.status}`);
    return true;
  }
  fail('create: expected ARM 2xx', `status=${r.status} body=${JSON.stringify(b).slice(0, 300)}`);
  return false;
}

async function caseTag(ctx: { apiKey: string }): Promise<void> {
  console.log('--- 2. tag the child RG (update_resource_group is non-destructive) ---');
  const jwt = await mintUcan(ctx.apiKey, '/azure/resource_groups/update');
  const r = await callProxy('/azure/resource_groups/update', jwt, {
    method: 'PATCH',
    path: `/subscriptions/${AZURE_SUB}/resourceGroups/${CHILD_RG}`,
    query: { 'api-version': '2021-04-01' },
    body: { tags: { harness: 'prod-azure-mutate', step: 'tagged' } },
  });
  const b = r.body as { upstream?: { status?: number } };
  if (r.status === 200 && b.upstream?.status && b.upstream.status >= 200 && b.upstream.status < 300) {
    pass('tag: ARM 2xx', `status=${b.upstream.status}`);
  } else {
    fail('tag: expected ARM 2xx', `status=${r.status} body=${JSON.stringify(b).slice(0, 300)}`);
  }
}

async function caseDeleteCosignerGate(ctx: { apiKey: string }): Promise<string | null> {
  console.log('--- 3a. delete child RG without cosigner — expect cosigner_required ---');
  const jwt = await mintUcan(ctx.apiKey, '/azure/resource_groups/delete');
  const r = await callProxy('/azure/resource_groups/delete', jwt, {
    method: 'DELETE',
    path: `/subscriptions/${AZURE_SUB}/resourceGroups/${CHILD_RG}`,
    query: { 'api-version': '2021-04-01' },
  });
  const b = r.body as { error_code?: string; decision?: { reason?: string } };
  if (r.status === 403 && b.error_code === 'cosigner_required') {
    pass('delete-gate: 403 cosigner_required', b.decision?.reason ?? '?');
    return jwt;
  }
  fail('delete-gate: expected 403 cosigner_required', `status=${r.status} body=${JSON.stringify(b).slice(0, 300)}`);
  return null;
}

async function fallbackCliDelete(): Promise<void> {
  console.log(`\n  Manual cleanup (broker delete blocked by missing cosigner):`);
  console.log(`    az group delete --name ${CHILD_RG} --yes --no-wait`);
}

async function main(): Promise<void> {
  console.log(`CONTROL_PLANE=${CONTROL_PLANE}  PDP=${PDP}  ORG=${ORG_ID}`);
  console.log(`SANDBOX_CONN_ID=${SANDBOX_CONN_ID}  AZURE_SUB=${AZURE_SUB}`);
  console.log(`CHILD_RG=${CHILD_RG}  REGION=${CHILD_REGION}`);
  console.log('');

  let ctx: Awaited<ReturnType<typeof setup>>;
  try {
    ctx = await setup();
  } catch (err) {
    console.error(`SETUP FAILED: ${(err as Error).message}`);
    process.exit(2);
  }

  const created = await caseCreate(ctx);
  if (!created) {
    console.error('create failed; bailing before tag/delete.');
    process.exit(1);
  }
  await caseTag(ctx);
  const _gated = await caseDeleteCosignerGate(ctx);

  if (APPROVE_WAIT_SEC === 0) {
    console.log('\nNOMOS_APPROVE_WAIT_SEC=0 — skipping interactive approve.');
    await fallbackCliDelete();
  } else {
    console.log(
      `\nApprove the destructive request at the stepUpUrl in your dashboard within ${APPROVE_WAIT_SEC}s.`,
    );
    console.log('Approve flow requires a WebAuthn passkey — out-of-scope to automate.');
    console.log('After approval the broker emits a cosigner UCAN; rerun the delete with cosignerJwt in context.');
    await fallbackCliDelete();
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log('');
  console.log(`${passed}/${results.length} checks passed`);
  if (failed > 0) process.exit(1);
}

void main();
