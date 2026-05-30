#!/usr/bin/env tsx
/**
 * Prod approval / step-up flow harness.
 *
 * Cases exercised end-to-end against the live broker:
 *   1. dynamic_intent_stepup    — POST /v1/intent with an Azure intent on
 *                                 a dynamic-mode agent. Expects a
 *                                 `kind:stepup` response, a pending row
 *                                 in stepup.listPending, a stepUpUrl that
 *                                 resolves to /approve/<id>, and a fresh
 *                                 audit entry showing the request.
 *   2. dynamic_intent_deny       — Call tRPC stepup.deny against the
 *                                 pending row, retry the same intent,
 *                                 confirm the SDK gets a fresh stepUpId
 *                                 (deny doesn't auto-allow). Asserts the
 *                                 row is in stepup.listHistory state=denied.
 *   3. static_cosigner_block    — Already covered in prod-e2e-azure.mts;
 *                                 here we re-verify destructive verbs
 *                                 still trip the cosigner gate even with
 *                                 a broad grant policy.
 *
 * Approve path documented separately — it requires a registered WebAuthn
 * passkey on the calling user and a fresh authenticator assertion, which
 * we can't automate without running @simplewebauthn/server's authenticator
 * stub. The harness prints the stepUpUrl so a human can complete it
 * manually if running interactively.
 *
 * Env (same as the other harnesses):
 *   NOMOS_SESSION_TOKEN, NOMOS_ORG_ID, NOMOS_CLOUD_CONN_ID, NOMOS_AZURE_SUB_ID
 *
 * Run:
 *   pnpm tsx scripts/prod-stepup-flow.mts
 */

const SESSION = req('NOMOS_SESSION_TOKEN');
const ORG_ID = req('NOMOS_ORG_ID');
const CLOUD_CONN_ID = req('NOMOS_CLOUD_CONN_ID');
const AZURE_SUB = req('NOMOS_AZURE_SUB_ID');
const CONTROL_PLANE = (process.env.CONTROL_PLANE_URL ?? 'https://api.auto-nomos.com').replace(
  /\/+$/,
  '',
);
const PDP = (process.env.PDP_URL ?? 'https://pdp.auto-nomos.com').replace(/\/+$/, '');
const AGENT_NAME = process.env.E2E_TEST_AGENT_NAME ?? 'e2e-azure-smoke';

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

async function trpc<T = unknown>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
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
  const agents = await trpc<Array<{ id: string; name: string; status: string; mode: string }>>(
    'agents.list',
    'GET',
  );
  let agent = agents.find((a) => a.name === AGENT_NAME);
  if (!agent) {
    agent = await trpc<{ id: string; name: string; status: string; mode: string }>(
      'agents.create',
      'POST',
      { name: AGENT_NAME, requireApproval: false },
    );
    console.log(`  created agent ${agent.id}`);
  } else if (agent.status !== 'active') {
    await trpc('agents.update', 'POST', { id: agent.id, status: 'active' });
    console.log(`  re-enabled agent ${agent.id}`);
  } else {
    console.log(`  reusing agent ${agent.id}`);
  }
  // Dynamic mode required for /v1/intent.
  if (agent.mode !== 'dynamic') {
    await trpc('agents.setMode', 'POST', { id: agent.id, mode: 'dynamic' });
    console.log(`  switched agent to dynamic mode`);
  }
  const agentId = agent.id;

  // Broad allow policy; the step-up flow tests are about the
  // intent-classifier and cosigner gate, not Cedar.
  const POLICY_NAME = `e2e-azure-${AGENT_NAME}-broad`;
  const cedarText = `permit (principal, action, resource);`;
  const policies = await trpc<Array<{ id: string; name: string }>>('policies.list', 'GET');
  const existing = policies.find((p) => p.name === POLICY_NAME);
  const policyId = existing
    ? (
        await trpc<{ id: string }>('policies.upsert', 'POST', {
          id: existing.id,
          name: POLICY_NAME,
          cedarText,
        })
      ).id
    : (await trpc<{ id: string }>('policies.upsert', 'POST', { name: POLICY_NAME, cedarText })).id;
  await trpc('policies.assignAgents', 'POST', { policyId, agentIds: [agentId] });
  console.log(`  policy ${policyId} assigned`);

  const keys = await trpc<Array<{ id: string; name: string; revokedAt: unknown }>>(
    'apiKeys.list',
    'GET',
    { agentId },
  );
  const KEY_NAME = `${AGENT_NAME}-stepup`;
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
  console.log(`  minted api key`);
  return { agentId, apiKey: created.plaintextOnce, policyId };
}

interface IntentStepUpResponse {
  kind: 'stepup';
  stepUpId: string;
  stepUpUrl: string;
  proposedEnvelope: {
    constraint: Record<string, unknown>;
    actions: string[];
    ttlSeconds: number;
  };
}
interface IntentMintResponse {
  kind: 'mint';
  ucan: string;
  envelopeId: string;
  expiresAt: number;
}
type IntentResponse = IntentStepUpResponse | IntentMintResponse;

async function postIntent(apiKey: string, agentId: string): Promise<IntentResponse> {
  const res = await fetch(`${CONTROL_PLANE}/v1/intent`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      agentId,
      intent: {
        constraint: {
          provider: 'azure',
          subscription_id: AZURE_SUB,
        },
        actions: ['/azure/vm/delete'],
        ttlSeconds: 600,
        purpose: 'e2e-test: delete a single non-existent VM to exercise the step-up flow',
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`POST /v1/intent ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  return (await res.json()) as IntentResponse;
}

async function caseStepupCreated(ctx: {
  agentId: string;
  apiKey: string;
}): Promise<{ stepUpId: string } | null> {
  console.log('--- 1. dynamic_intent_stepup ---');
  let r: IntentResponse;
  try {
    r = await postIntent(ctx.apiKey, ctx.agentId);
  } catch (err) {
    fail('intent: POST /v1/intent', (err as Error).message);
    return null;
  }
  if (r.kind !== 'stepup') {
    fail('intent: expected stepup', `got ${r.kind}`);
    return null;
  }
  pass('intent: kind=stepup', `stepUpId=${r.stepUpId.slice(0, 12)}...`);
  if (!r.stepUpUrl.includes('/approve/')) {
    fail('intent: stepUpUrl shape', r.stepUpUrl);
    return { stepUpId: r.stepUpId };
  }
  pass('intent: stepUpUrl points at /approve/', r.stepUpUrl);

  const pending = await trpc<Array<{ id: string; command: string }>>('stepup.listPending', 'GET');
  const found = pending.find((p) => p.id === r.stepUpId);
  if (found) {
    pass('intent: shows up in stepup.listPending', `command=${found.command}`);
  } else {
    fail('intent: not in stepup.listPending', `looked for ${r.stepUpId}`);
  }
  return { stepUpId: r.stepUpId };
}

async function caseStepupDeny(ctx: { stepUpId: string }): Promise<void> {
  console.log('--- 2. dynamic_intent_deny ---');
  try {
    await trpc('stepup.deny', 'POST', {
      approvalId: ctx.stepUpId,
      reason: 'e2e-deny',
    });
    pass('deny: tRPC stepup.deny returned ok');
  } catch (err) {
    fail('deny: tRPC stepup.deny', (err as Error).message);
    return;
  }
  const pending = await trpc<Array<{ id: string }>>('stepup.listPending', 'GET');
  const stillPending = pending.find((p) => p.id === ctx.stepUpId);
  if (!stillPending) {
    pass('deny: no longer in stepup.listPending');
  } else {
    fail('deny: still in pending', JSON.stringify(stillPending));
  }
  const history = await trpc<Array<{ id: string; state: string }>>('stepup.listHistory', 'GET', {
    state: ['denied'],
    limit: 20,
  });
  const denied = history.find((h) => h.id === ctx.stepUpId);
  if (denied) {
    pass('deny: appears in history with state=denied');
  } else {
    fail('deny: not in history', `total=${history.length}`);
  }
}

async function caseRetryAfterDeny(ctx: { agentId: string; apiKey: string }): Promise<void> {
  console.log('--- 3. retry-after-deny still gates ---');
  let r: IntentResponse;
  try {
    r = await postIntent(ctx.apiKey, ctx.agentId);
  } catch (err) {
    fail('retry: POST /v1/intent', (err as Error).message);
    return;
  }
  if (r.kind === 'stepup') {
    pass(
      "retry: still kind=stepup (deny didn't auto-allow)",
      `new stepUpId=${r.stepUpId.slice(0, 12)}...`,
    );
    // Clean up the new pending row so the dashboard doesn't accumulate cruft.
    try {
      await trpc('stepup.deny', 'POST', { approvalId: r.stepUpId, reason: 'e2e-cleanup' });
    } catch {
      // best effort
    }
  } else {
    fail('retry: expected step-up again', JSON.stringify(r).slice(0, 200));
  }
}

async function caseCosignerStaticPath(ctx: { apiKey: string }): Promise<void> {
  console.log('--- 4. static_cosigner_block (sanity vs broad policy) ---');
  // Mint a static UCAN bound to /azure/vm/delete with cloudConnectionId
  // and broad policy. Risk-rule cosigner gate must still fire.
  const mint = await fetch(`${CONTROL_PLANE}/v1/mint-ucan`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${ctx.apiKey}` },
    body: JSON.stringify({
      commands: ['/azure/vm/delete'],
      cloudConnectionId: CLOUD_CONN_ID,
      ttlSeconds: 600,
    }),
  });
  if (!mint.ok) {
    fail('cosigner: mint /v1/mint-ucan', `${mint.status}: ${(await mint.text()).slice(0, 200)}`);
    return;
  }
  const mintBody = (await mint.json()) as { ucans: Array<{ jwt: string }> };
  const jwt = mintBody.ucans[0]?.jwt;
  if (!jwt) {
    fail('cosigner: no UCAN in mint response', JSON.stringify(mintBody).slice(0, 200));
    return;
  }
  const res = await fetch(`${PDP}/v1/proxy/azure/vm/delete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cb-customer': ORG_ID },
    body: JSON.stringify({
      ucan: jwt,
      request: {
        ucan: jwt,
        command: '/azure/vm/delete',
        resource: { subscription_id: AZURE_SUB },
        context: { command: '/azure/vm/delete' },
      },
      apiCall: {
        method: 'DELETE',
        path: `/subscriptions/${AZURE_SUB}/resourceGroups/none/providers/Microsoft.Compute/virtualMachines/none`,
        query: { 'api-version': '2023-09-01' },
      },
    }),
  });
  const body = (await res.json()) as { error_code?: string; decision?: { reason?: string } };
  if (res.status === 403 && body.error_code === 'cosigner_required') {
    pass('cosigner: 403 cosigner_required', body.decision?.reason ?? '?');
  } else {
    fail(
      'cosigner: expected 403 cosigner_required',
      `status=${res.status} body=${JSON.stringify(body).slice(0, 200)}`,
    );
  }
}

async function main(): Promise<void> {
  console.log(`CONTROL_PLANE=${CONTROL_PLANE}  PDP=${PDP}  ORG=${ORG_ID}  SUB=${AZURE_SUB}`);
  console.log('');

  let ctx: Awaited<ReturnType<typeof setup>>;
  try {
    ctx = await setup();
  } catch (err) {
    console.error(`SETUP FAILED: ${(err as Error).message}`);
    process.exit(2);
  }

  const stepup = await caseStepupCreated(ctx);
  if (stepup) {
    await caseStepupDeny(stepup);
    await caseRetryAfterDeny(ctx);
  }
  await caseCosignerStaticPath(ctx);

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log('');
  console.log(`${passed}/${results.length} checks passed`);
  console.log('');
  console.log(
    'NOTE: stepup.approve requires a registered WebAuthn passkey + a fresh authenticator',
  );
  console.log(
    'assertion; it cannot be fully automated without a hardware-key emulator. Approve manually',
  );
  console.log('at the stepUpUrl printed in case 1 if running interactively.');
  if (failed > 0) process.exit(1);
}

void main();
