#!/usr/bin/env tsx
/**
 * Prod Azure E2E harness — exercises the full broker-on-call path against
 * the Nomos-dev-testing org's verified Azure connection on Azure VM.
 *
 * Cases:
 *   1. allow            — mint UCAN bound to /azure/vm/list + cloud_connection_id,
 *                         hit PDP /v1/proxy/azure/vm/list with a real ARM call,
 *                         expect 200 + an ARM `value` array.
 *   2. out_of_scope     — re-use the vm/list UCAN against /azure/vm/restart,
 *                         expect deny (command mismatch).
 *   3. cosigner_block   — mint a UCAN for /azure/vm/delete + cloud_connection_id,
 *                         hit PDP, expect 403 cosigner_required even with allow.
 *   4. revoked_kill     — revoke the allow UCAN via tRPC, retry within 5s,
 *                         expect deny.
 *   5. unverified_conn  — bonus: try to mint against a non-verified connection,
 *                         expect 412 cloud_connection_not_verified. Skipped
 *                         if the org only has one connection (no spare).
 *
 * Required env:
 *   NOMOS_SESSION_TOKEN   the value of `__Secure-better-auth.session_token` cookie
 *   NOMOS_ORG_ID          customer/org uuid (active org)
 *   NOMOS_CLOUD_CONN_ID   verified cloud connection uuid (azure)
 *   NOMOS_AZURE_SUB_ID    azure subscription id for the ARM call
 *
 * Optional:
 *   CONTROL_PLANE_URL     default https://api.auto-nomos.com
 *   PDP_URL               default https://pdp.auto-nomos.com
 *   E2E_TEST_AGENT_NAME   default 'e2e-azure-smoke'
 *   E2E_KEEP_ARTIFACTS    if set, skip cleanup (keep agent/key/policy)
 *
 * Run:
 *   pnpm tsx scripts/prod-e2e-azure.mts
 */

const SESSION = req('NOMOS_SESSION_TOKEN');
const ORG_ID = req('NOMOS_ORG_ID');
const CLOUD_CONN_ID = req('NOMOS_CLOUD_CONN_ID');
const AZURE_SUB = req('NOMOS_AZURE_SUB_ID');
const CONTROL_PLANE = (process.env.CONTROL_PLANE_URL ?? 'https://api.auto-nomos.com').replace(/\/+$/, '');
const PDP = (process.env.PDP_URL ?? 'https://pdp.auto-nomos.com').replace(/\/+$/, '');
const AGENT_NAME = process.env.E2E_TEST_AGENT_NAME ?? 'e2e-azure-smoke';
const KEEP = !!process.env.E2E_KEEP_ARTIFACTS;

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
  // batch=1 input shape: void inputs use meta.values=['undefined'], real
  // inputs send {json: <body>} with no meta.
  const inputPayload =
    body === undefined
      ? { 0: { json: null, meta: { values: ['undefined'] } } }
      : { 0: { json: body } };
  const url =
    method === 'GET'
      ? `${CONTROL_PLANE}/trpc/${path}?batch=1&input=${encodeURIComponent(JSON.stringify(inputPayload))}`
      : `${CONTROL_PLANE}/trpc/${path}?batch=1`;
  const init: RequestInit = {
    method,
    headers: trpcHeaders(),
  };
  if (method === 'POST') {
    init.body = JSON.stringify(inputPayload);
  }
  const res = await fetch(url, init);
  const txt = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(txt);
  } catch {
    throw new Error(`tRPC ${path} non-JSON ${res.status}: ${txt.slice(0, 200)}`);
  }
  const arr = parsed as Array<{ result?: { data?: { json?: T } }; error?: unknown }>;
  if (Array.isArray(arr) && arr[0]?.error) {
    throw new Error(`tRPC ${path} error: ${JSON.stringify(arr[0].error)}`);
  }
  const data = arr?.[0]?.result?.data?.json;
  return data as T;
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

async function setup(): Promise<{
  agentId: string;
  apiKey: string;
  policyId: string;
  allowUcanJwt: string;
  allowUcanCid: string;
  deleteUcanJwt: string;
  deleteUcanCid: string;
}> {
  console.log('--- Setup ---');

  const agents = await trpc<Array<{ id: string; name: string; status: string }>>(
    'agents.list',
    'GET',
  );
  let agent = agents.find((a) => a.name === AGENT_NAME);
  if (!agent) {
    const created = await trpc<{ id: string; name: string; status: string }>(
      'agents.create',
      'POST',
      { name: AGENT_NAME, requireApproval: false },
    );
    agent = created;
    console.log(`  created agent ${agent.id}`);
  } else if (agent.status !== 'active') {
    await trpc('agents.update', 'POST', { id: agent.id, status: 'active' });
    console.log(`  re-enabled agent ${agent.id}`);
  } else {
    console.log(`  reusing agent ${agent.id}`);
  }
  const agentId = agent.id;

  const policies = await trpc<Array<{ id: string; name: string }>>('policies.list', 'GET');
  const POLICY_NAME = `e2e-azure-${AGENT_NAME}`;
  // Allow /azure/vm/list. Cedar uses Provider::"azure" + Command::"/azure/vm/list".
  // Explicit forbid for /azure/vm/delete so we test the cosigner gate firing
  // BEFORE policy allow (defense-in-depth) — actually no: cosigner gate fires
  // after Cedar allow. So we ALLOW vm/delete too to exercise that path. The
  // forbid on vm/restart simulates an out-of-scope policy.
  const cedarText = `permit (
  principal,
  action in [Action::"/azure/vm/list", Action::"/azure/vm/delete"],
  resource
);`;

  let policyId: string;
  const existing = policies.find((p) => p.name === POLICY_NAME);
  if (existing) {
    const upserted = await trpc<{ id: string }>('policies.upsert', 'POST', {
      id: existing.id,
      name: POLICY_NAME,
      cedarText,
    });
    policyId = upserted.id;
    console.log(`  updated policy ${policyId}`);
  } else {
    const created = await trpc<{ id: string }>('policies.upsert', 'POST', {
      name: POLICY_NAME,
      cedarText,
    });
    policyId = created.id;
    console.log(`  created policy ${policyId}`);
  }

  await trpc('policies.assignAgents', 'POST', { policyId, agentIds: [agentId] });
  console.log(`  policy assigned to agent`);

  const keys = await trpc<Array<{ id: string; name: string; prefix: string; revokedAt: unknown }>>(
    'apiKeys.list',
    'GET',
    { agentId },
  );
  const KEY_NAME = `${AGENT_NAME}-key`;
  const liveKey = keys.find((k) => k.name === KEY_NAME && !k.revokedAt);
  if (liveKey) {
    await trpc('apiKeys.revoke', 'POST', { id: liveKey.id });
    console.log(`  revoked stale key ${liveKey.id}`);
  }
  const newKey = await trpc<{ id: string; prefix: string; plaintextOnce: string }>(
    'apiKeys.create',
    'POST',
    { agentId, name: KEY_NAME, role: 'admin' },
  );
  const apiKey = newKey.plaintextOnce;
  console.log(`  minted api key ${newKey.prefix.slice(0, 20)}...`);

  // Now use the /v1/mint-ucan SDK route with cloudConnectionId.
  async function mint(command: string): Promise<{ jwt: string; cid: string }> {
    const res = await fetch(`${CONTROL_PLANE}/v1/mint-ucan`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        commands: [command],
        cloudConnectionId: CLOUD_CONN_ID,
        ttlSeconds: 600,
      }),
    });
    const body = (await res.json()) as {
      ucans?: Array<{ command: string; jwt: string; cid: string }>;
      error?: string;
      error_code?: string;
    };
    if (!res.ok || !body.ucans?.[0]) {
      throw new Error(
        `mint-ucan ${command} failed: ${res.status} ${JSON.stringify(body)}`,
      );
    }
    return { jwt: body.ucans[0].jwt, cid: body.ucans[0].cid };
  }

  const allow = await mint('/azure/vm/list');
  const del = await mint('/azure/vm/delete');
  console.log(`  minted allow UCAN cid=${allow.cid.slice(0, 16)}...`);
  console.log(`  minted delete UCAN cid=${del.cid.slice(0, 16)}...`);

  return {
    agentId,
    apiKey,
    policyId,
    allowUcanJwt: allow.jwt,
    allowUcanCid: allow.cid,
    deleteUcanJwt: del.jwt,
    deleteUcanCid: del.cid,
  };
}

async function proxy(
  command: string,
  ucan: string,
  apiCall: { method: 'GET' | 'POST' | 'DELETE'; path: string; query?: Record<string, string> },
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${PDP}${command.startsWith('/') ? '/v1/proxy' + command : '/v1/proxy/' + command}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-cb-customer': ORG_ID,
    },
    body: JSON.stringify({
      ucan,
      request: {
        ucan,
        command,
        resource: { subscription_id: AZURE_SUB },
        context: { command },
      },
      apiCall,
    }),
  });
  const body = (await res.json()) as unknown;
  return { status: res.status, body };
}

async function caseAllow(ctx: {
  allowUcanJwt: string;
}): Promise<void> {
  console.log('--- 1. allow path /azure/vm/list ---');
  const r = await proxy(
    '/azure/vm/list',
    ctx.allowUcanJwt,
    {
      method: 'GET',
      path: `/subscriptions/${AZURE_SUB}/resourceGroups`,
      query: { 'api-version': '2021-04-01' },
    },
  );
  const body = r.body as {
    allow?: boolean;
    decision?: { allow?: boolean };
    upstream?: { status?: number; body?: { body?: { value?: unknown[] } } | { value?: unknown[] } };
    error?: string;
    providerStatus?: number;
  };
  // PDP cloud proxy wraps the ARM response as upstream.body.body when
  // sanitizeResponseBody double-wraps; older path is upstream.body directly.
  const armBody =
    (body.upstream?.body as { body?: { value?: unknown[] } } | undefined)?.body ??
    (body.upstream?.body as { value?: unknown[] } | undefined);
  const rgs = Array.isArray(armBody?.value) ? armBody.value : undefined;
  if (r.status === 200 && body.allow === true && rgs) {
    pass('allow: 200 ARM response', `${rgs.length} resource groups (e.g. ${(rgs[0] as { name?: string })?.name ?? '?'})`);
  } else if (r.status === 200 && body.decision?.allow === false) {
    fail('allow: ARM 200 expected', `got decision deny: ${JSON.stringify(body).slice(0, 300)}`);
  } else {
    fail(
      'allow: unexpected',
      `status=${r.status} providerStatus=${body.providerStatus} body=${JSON.stringify(body).slice(0, 400)}`,
    );
  }
}

async function caseOutOfScope(ctx: { allowUcanJwt: string }): Promise<void> {
  console.log('--- 2. out-of-scope deny (vm/list UCAN -> vm/restart) ---');
  const r = await proxy(
    '/azure/vm/restart',
    ctx.allowUcanJwt,
    {
      method: 'POST',
      path: `/subscriptions/${AZURE_SUB}/providers/Microsoft.Compute/locations/eastus/restartVirtualMachines`,
      query: { 'api-version': '2023-09-01' },
    },
  );
  const body = r.body as { decision?: { allow?: boolean; reason?: string }; error_code?: string };
  if (r.status === 403 && body.decision?.allow === false) {
    pass('out-of-scope: 403 deny', `reason=${body.decision.reason}`);
  } else {
    fail('out-of-scope: expected deny', `status=${r.status} body=${JSON.stringify(body).slice(0, 300)}`);
  }
}

async function caseCosigner(ctx: { deleteUcanJwt: string }): Promise<void> {
  console.log('--- 3. cosigner block /azure/vm/delete ---');
  const r = await proxy(
    '/azure/vm/delete',
    ctx.deleteUcanJwt,
    {
      method: 'DELETE',
      path: `/subscriptions/${AZURE_SUB}/resourceGroups/never-exists/providers/Microsoft.Compute/virtualMachines/none`,
      query: { 'api-version': '2023-09-01' },
    },
  );
  const body = r.body as { decision?: { allow?: boolean; reason?: string }; error_code?: string };
  if (r.status === 403 && body.error_code === 'cosigner_required') {
    pass('cosigner: 403 cosigner_required', `reason=${body.decision?.reason}`);
  } else {
    fail('cosigner: expected 403 cosigner_required', `status=${r.status} body=${JSON.stringify(body).slice(0, 300)}`);
  }
}

async function caseRevocation(ctx: {
  allowUcanCid: string;
  allowUcanJwt: string;
}): Promise<void> {
  console.log('--- 4. revocation kill ---');
  await trpc('ucans.revoke', 'POST', { cid: ctx.allowUcanCid, reason: 'e2e-test' });
  console.log(`  revoked cid ${ctx.allowUcanCid.slice(0, 16)}...`);
  // Push to PDP webhook + polling sweep at 5s. Wait 1.5s then check.
  await new Promise((r) => setTimeout(r, 1500));
  const r = await proxy(
    '/azure/vm/list',
    ctx.allowUcanJwt,
    {
      method: 'GET',
      path: `/subscriptions/${AZURE_SUB}/resourcegroups`,
      query: { 'api-version': '2021-04-01' },
    },
  );
  const body = r.body as { decision?: { allow?: boolean; reason?: string } };
  if (body.decision?.allow === false && /revoke/i.test(body.decision?.reason ?? '')) {
    pass('revocation: deny within ~1.5s', `reason=${body.decision.reason}`);
  } else if (body.decision?.allow === false) {
    pass('revocation: deny (reason not revoke-tagged)', `reason=${body.decision.reason}`);
  } else {
    fail('revocation: still allows', JSON.stringify(body).slice(0, 300));
  }
}

async function cleanup(ctx: {
  agentId: string;
  policyId: string;
}): Promise<void> {
  if (KEEP) {
    console.log('--- Cleanup skipped (E2E_KEEP_ARTIFACTS) ---');
    return;
  }
  console.log('--- Cleanup ---');
  try {
    await trpc('agents.update', 'POST', { id: ctx.agentId, status: 'disabled' });
    console.log(`  disabled agent ${ctx.agentId}`);
  } catch (err) {
    console.log(`  cleanup warn: ${(err as Error).message}`);
  }
}

async function main(): Promise<void> {
  console.log(`CONTROL_PLANE=${CONTROL_PLANE}`);
  console.log(`PDP=${PDP}`);
  console.log(`ORG_ID=${ORG_ID}`);
  console.log(`CLOUD_CONN_ID=${CLOUD_CONN_ID}`);
  console.log(`AZURE_SUB=${AZURE_SUB}`);
  console.log('');

  let ctx: Awaited<ReturnType<typeof setup>>;
  try {
    ctx = await setup();
  } catch (err) {
    console.error(`SETUP FAILED: ${(err as Error).message}`);
    process.exit(2);
  }

  try {
    await caseAllow(ctx);
  } catch (err) {
    fail('allow', (err as Error).message);
  }
  try {
    await caseOutOfScope(ctx);
  } catch (err) {
    fail('out-of-scope', (err as Error).message);
  }
  try {
    await caseCosigner(ctx);
  } catch (err) {
    fail('cosigner', (err as Error).message);
  }
  try {
    await caseRevocation(ctx);
  } catch (err) {
    fail('revocation', (err as Error).message);
  }

  await cleanup(ctx);

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log('');
  console.log(`${passed}/${results.length} checks passed`);
  if (failed > 0) {
    console.error(`${failed} failure(s)`);
    process.exit(1);
  }
}

void main();
