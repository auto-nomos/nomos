/**
 * Shared harness primitives for prod / local mutate scripts.
 *
 * Patterned on scripts/prod-azure-mutate.mts. Provider-agnostic: each caller
 * supplies command paths, UCAN constraint, apiCall payload, and assertions.
 *
 * Generic env (callers may override):
 *   CONTROL_PLANE_URL   default https://api.auto-nomos.com
 *   PDP_URL             default https://pdp.auto-nomos.com
 *   NOMOS_SESSION_TOKEN better-auth session cookie value
 *   NOMOS_ORG_ID        customer/org uuid
 */

export const CONTROL_PLANE = (process.env.CONTROL_PLANE_URL ?? 'https://api.auto-nomos.com').replace(
  /\/+$/,
  '',
);
export const PDP = (process.env.PDP_URL ?? 'https://pdp.auto-nomos.com').replace(/\/+$/, '');

export function req(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`missing required env: ${name}`);
    process.exit(2);
  }
  return v;
}

export function cookieHeader(session: string): string {
  return `__Secure-better-auth.session_token=${session}`;
}

export function trpcHeaders(session: string, orgId: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    cookie: cookieHeader(session),
    origin: 'https://app.auto-nomos.com',
    referer: 'https://app.auto-nomos.com/',
    'x-cb-org': orgId,
  };
}

export async function trpc<T = unknown>(
  controlPlane: string,
  session: string,
  orgId: string,
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
      ? `${controlPlane}/trpc/${path}?batch=1&input=${encodeURIComponent(JSON.stringify(inputPayload))}`
      : `${controlPlane}/trpc/${path}?batch=1`;
  const init: RequestInit = { method, headers: trpcHeaders(session, orgId) };
  if (method === 'POST') init.body = JSON.stringify(inputPayload);
  const res = await fetch(url, init);
  const txt = await res.text();
  let arr: Array<{ result?: { data?: { json?: T } }; error?: unknown }>;
  try {
    arr = JSON.parse(txt) as Array<{ result?: { data?: { json?: T } }; error?: unknown }>;
  } catch {
    throw new Error(`tRPC ${path} non-json ${res.status}: ${txt.slice(0, 300)}`);
  }
  if (Array.isArray(arr) && arr[0]?.error) {
    throw new Error(`tRPC ${path} error: ${JSON.stringify(arr[0].error)}`);
  }
  return arr[0]!.result!.data!.json as T;
}

export interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
}

export class Results {
  list: CheckResult[] = [];
  pass(name: string, detail?: string): void {
    this.list.push({ name, ok: true, ...(detail !== undefined ? { detail } : {}) });
    console.log(`  PASS  ${name}${detail ? `  (${detail})` : ''}`);
  }
  fail(name: string, detail: string): void {
    this.list.push({ name, ok: false, detail });
    console.log(`  FAIL  ${name}  (${detail})`);
  }
  summary(): { passed: number; failed: number; total: number } {
    const passed = this.list.filter((r) => r.ok).length;
    return { passed, failed: this.list.length - passed, total: this.list.length };
  }
  exit(): never {
    const s = this.summary();
    console.log('');
    console.log(`${s.passed}/${s.total} checks passed`);
    process.exit(s.failed > 0 ? 1 : 0);
  }
}

export interface AgentCtx {
  agentId: string;
  apiKey: string;
  policyId: string;
}

/**
 * Reuse-or-create agent + Cedar policy + admin api key.
 * cloudConnectionId is optional — only Azure-style providers use it.
 * exitIfAgentNew=true bails (exit 2) when a brand-new agent is provisioned so
 * the operator can register the FIC. For filesystem/SSH there's nothing to
 * register, so pass false.
 */
export async function setupAgent(args: {
  controlPlane: string;
  session: string;
  orgId: string;
  agentName: string;
  policyName: string;
  cedarText: string;
  exitIfAgentNew: boolean;
}): Promise<AgentCtx> {
  const { controlPlane, session, orgId, agentName, policyName, cedarText, exitIfAgentNew } = args;
  const t = <T,>(p: string, m: 'GET' | 'POST', b?: unknown): Promise<T> =>
    trpc<T>(controlPlane, session, orgId, p, m, b);

  const agents = await t<Array<{ id: string; name: string; status: string }>>('agents.list', 'GET');
  let agent = agents.find((a) => a.name === agentName);
  if (!agent) {
    agent = await t<{ id: string; name: string; status: string }>('agents.create', 'POST', {
      name: agentName,
      requireApproval: false,
    });
    console.log(`  created agent ${agent.id}`);
    if (exitIfAgentNew) {
      console.log(`  IMPORTANT: provider setup needed on agent ${agent.id} before rerunning.`);
      process.exit(2);
    }
  }
  if (agent.status !== 'active') {
    await t('agents.update', 'POST', { id: agent.id, status: 'active' });
  }
  console.log(`  agent ${agent.id} (${agent.name}) active`);
  const agentId = agent.id;

  const policies = await t<Array<{ id: string; name: string }>>('policies.list', 'GET');
  const existing = policies.find((p) => p.name === policyName);
  const policyId = existing
    ? (await t<{ id: string }>('policies.upsert', 'POST', {
        id: existing.id,
        name: policyName,
        cedarText,
      })).id
    : (await t<{ id: string }>('policies.upsert', 'POST', { name: policyName, cedarText })).id;
  await t('policies.assignAgents', 'POST', { policyId, agentIds: [agentId] });

  const keyName = `${agentName}-key`;
  const keys = await t<Array<{ id: string; name: string; revokedAt: unknown }>>(
    'apiKeys.list',
    'GET',
    { agentId },
  );
  for (const k of keys) {
    if (k.name === keyName && !k.revokedAt) {
      await t('apiKeys.revoke', 'POST', { id: k.id });
    }
  }
  const created = await t<{ plaintextOnce: string }>('apiKeys.create', 'POST', {
    agentId,
    name: keyName,
    role: 'admin',
  });
  return { agentId, apiKey: created.plaintextOnce, policyId };
}

export interface MintStaticArgs {
  controlPlane: string;
  apiKey: string;
  commands: string[];
  cloudConnectionId?: string;
  ttlSeconds?: number;
}

/**
 * Static-mode UCAN mint via POST /v1/mint-ucan. No resource_constraint —
 * suitable for Azure-style cloud_connection flows where the constraint
 * sits on the cloud_connection row, not the UCAN.
 */
export async function mintStaticUcan(args: MintStaticArgs): Promise<string> {
  const body: Record<string, unknown> = {
    commands: args.commands,
    ttlSeconds: args.ttlSeconds ?? 600,
  };
  if (args.cloudConnectionId) body.cloudConnectionId = args.cloudConnectionId;
  const res = await fetch(`${args.controlPlane}/v1/mint-ucan`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${args.apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(
      `mint-static ${args.commands.join(',')} ${res.status}: ${(await res.text()).slice(0, 400)}`,
    );
  }
  const j = (await res.json()) as { ucans: Array<{ jwt: string }> };
  if (!j.ucans[0]) throw new Error('no ucan in mint response');
  return j.ucans[0].jwt;
}

export interface MintIntentArgs {
  controlPlane: string;
  apiKey: string;
  agentId: string;
  command: string;
  constraint: Record<string, unknown>;
  ttlSeconds?: number;
  purpose?: string;
}

export interface MintIntentResult {
  kind: 'mint' | 'stepup';
  ucan?: string;
  envelopeId?: string;
  expiresAt?: number;
  stepUpId?: string;
  stepUpUrl?: string;
  raw: unknown;
}

/**
 * Dynamic-mode mint via POST /v1/intent. Carries
 * meta.resource_constraint = constraint into the issued UCAN. Agent must
 * be in mode='dynamic' or the control plane returns 403 agent_static_mode.
 */
export async function mintIntentUcan(args: MintIntentArgs): Promise<MintIntentResult> {
  const body = {
    agentId: args.agentId,
    intent: {
      constraint: args.constraint,
      actions: [args.command],
      ttlSeconds: args.ttlSeconds ?? 600,
      ...(args.purpose ? { purpose: args.purpose } : {}),
    },
  };
  const res = await fetch(`${args.controlPlane}/v1/intent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${args.apiKey}` },
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(txt);
  } catch {
    throw new Error(`intent ${args.command} non-json ${res.status}: ${txt.slice(0, 400)}`);
  }
  if (!res.ok) {
    throw new Error(`intent ${args.command} ${res.status}: ${txt.slice(0, 400)}`);
  }
  const p = parsed as {
    kind: 'mint' | 'stepup';
    ucan?: string;
    envelopeId?: string;
    expiresAt?: number;
    stepUpId?: string;
    stepUpUrl?: string;
  };
  return { ...p, raw: parsed };
}

export async function setAgentMode(
  controlPlane: string,
  session: string,
  orgId: string,
  agentId: string,
  mode: 'static' | 'dynamic',
): Promise<void> {
  await trpc(controlPlane, session, orgId, 'agents.setMode', 'POST', { id: agentId, mode });
}

export interface StepUpStatus {
  id: string;
  state: 'pending' | 'approved' | 'denied' | 'expired';
  cosignerJwt?: string | null;
  expiresAt?: string | number;
}

/**
 * Polls PDP `/v1/stepup/:id` until state != 'pending' or timeout.
 * Returns the final status. The cosignerJwt field is populated only
 * when state='approved'.
 */
export async function pollStepupApproval(args: {
  pdp: string;
  orgId: string;
  stepUpId: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
}): Promise<StepUpStatus> {
  const timeoutMs = args.timeoutMs ?? 300_000;
  const pollIntervalMs = args.pollIntervalMs ?? 2_000;
  const deadline = Date.now() + timeoutMs;
  const url = `${args.pdp}/v1/stepup/${encodeURIComponent(args.stepUpId)}`;
  const headers = { 'x-cb-customer': args.orgId };
  let pollCount = 0;
  while (Date.now() < deadline) {
    pollCount += 1;
    let res: Response;
    try {
      res = await fetch(url, { headers });
    } catch (err) {
      if (process.env.NOMOS_STEPUP_TRACE) console.log(`  [poll ${pollCount}] fetch err: ${(err as Error).message}`);
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      continue;
    }
    if (res.status === 404) {
      if (process.env.NOMOS_STEPUP_TRACE) console.log(`  [poll ${pollCount}] 404 — approval not visible to PDP yet, retrying`);
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      continue;
    }
    if (!res.ok) {
      if (process.env.NOMOS_STEPUP_TRACE) console.log(`  [poll ${pollCount}] ${res.status}`);
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      continue;
    }
    const body = (await res.json().catch(() => null)) as StepUpStatus | null;
    if (!body) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      continue;
    }
    if (body.state !== 'pending') {
      return body;
    }
    if (pollCount === 1 || pollCount % 15 === 0) {
      const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      console.log(`  [poll ${pollCount}] state=pending, ${remaining}s remaining`);
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  return { id: args.stepUpId, state: 'expired' };
}

export interface ApprovedIntentArgs {
  controlPlane: string;
  pdp: string;
  orgId: string;
  apiKey: string;
  agentId: string;
  command: string;
  /** Full action list to put in envelope. /v1/intent only mints UCAN for
   *  command (== actions[0]), but the envelope covers all of these so
   *  subsequent calls for the other actions silent-mint. */
  envelopeActions: string[];
  constraint: Record<string, unknown>;
  ttlSeconds?: number;
  purpose?: string;
  approveWaitSec?: number;
}

/**
 * Mints an intent UCAN, automating the cosigner-approval loop.
 *
 * First call /v1/intent. If the response is already kind=mint (an
 * existing envelope covers it), return the UCAN. Otherwise print the
 * step-up URL, poll PDP /v1/stepup/:id until the operator approves via
 * passkey, then retry /v1/intent with the cosignerJwt to receive the
 * minted UCAN + the new envelope id.
 */
export async function mintIntentWithApproval(args: ApprovedIntentArgs): Promise<{
  ucan: string;
  envelopeId: string;
  approved: boolean;
}> {
  const intentBody = {
    agentId: args.agentId,
    intent: {
      constraint: args.constraint,
      actions: args.envelopeActions,
      ttlSeconds: args.ttlSeconds ?? 600,
      ...(args.purpose ? { purpose: args.purpose } : {}),
    },
  };

  const first = await fetch(`${args.controlPlane}/v1/intent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${args.apiKey}` },
    body: JSON.stringify(intentBody),
  });
  const firstText = await first.text();
  if (!first.ok) {
    throw new Error(`intent ${args.command} ${first.status}: ${firstText.slice(0, 400)}`);
  }
  const firstJson = JSON.parse(firstText) as {
    kind: 'mint' | 'stepup';
    ucan?: string;
    envelopeId?: string;
    stepUpId?: string;
    stepUpUrl?: string;
  };
  if (firstJson.kind === 'mint' && firstJson.ucan && firstJson.envelopeId) {
    return { ucan: firstJson.ucan, envelopeId: firstJson.envelopeId, approved: false };
  }
  if (firstJson.kind !== 'stepup' || !firstJson.stepUpId || !firstJson.stepUpUrl) {
    throw new Error(`unexpected intent response: ${firstText.slice(0, 400)}`);
  }

  console.log('');
  console.log(`  >>> APPROVE: ${firstJson.stepUpUrl}`);
  console.log('  >>> open in browser, authenticate with passkey, click approve.');
  console.log(`  >>> waiting up to ${args.approveWaitSec ?? 300}s ...`);

  const status = await pollStepupApproval({
    pdp: args.pdp,
    orgId: args.orgId,
    stepUpId: firstJson.stepUpId,
    timeoutMs: (args.approveWaitSec ?? 300) * 1000,
  });
  if (status.state !== 'approved' || !status.cosignerJwt) {
    throw new Error(
      `approval not received (state=${status.state}). stepUpId=${firstJson.stepUpId}`,
    );
  }
  console.log(`  approved by passkey, cosigner JWT received.`);

  // Retry intent with cosignerJwt — control-plane creates envelope + mints
  // child UCAN.
  const retryBody = { ...intentBody, cosignerJwt: status.cosignerJwt };
  const second = await fetch(`${args.controlPlane}/v1/intent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${args.apiKey}` },
    body: JSON.stringify(retryBody),
  });
  const secondText = await second.text();
  if (!second.ok) {
    throw new Error(`intent retry ${args.command} ${second.status}: ${secondText.slice(0, 400)}`);
  }
  const secondJson = JSON.parse(secondText) as {
    kind: 'mint' | 'stepup';
    ucan?: string;
    envelopeId?: string;
  };
  if (secondJson.kind !== 'mint' || !secondJson.ucan || !secondJson.envelopeId) {
    throw new Error(`intent retry did not mint: ${secondText.slice(0, 400)}`);
  }
  return { ucan: secondJson.ucan, envelopeId: secondJson.envelopeId, approved: true };
}

export interface ProxyArgs {
  pdp: string;
  orgId: string;
  command: string;
  ucan: string;
  resource?: Record<string, unknown>;
  context?: Record<string, unknown>;
  apiCall: {
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    path: string;
    query?: Record<string, string>;
    body?: Record<string, unknown>;
  };
}

export async function pdpProxy(args: ProxyArgs): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${args.pdp}/v1/proxy${args.command}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cb-customer': args.orgId },
    body: JSON.stringify({
      ucan: args.ucan,
      request: {
        ucan: args.ucan,
        command: args.command,
        resource: args.resource ?? {},
        context: { command: args.command, ...(args.context ?? {}) },
      },
      apiCall: args.apiCall,
    }),
  });
  let body: unknown;
  const txt = await res.text();
  try {
    body = JSON.parse(txt);
  } catch {
    body = { raw: txt };
  }
  return { status: res.status, body };
}
