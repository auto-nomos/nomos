#!/usr/bin/env tsx
/**
 * Deployed-URL smoke test. Hits the live PDP + control-plane and asserts
 * the contract surface every redeploy must hold.
 *
 * What it asserts (must pass after every prod deploy):
 *   1. Both /healthz endpoints return 200.
 *   2. /v1/authorize with an unknown customer returns a properly-shaped
 *      AuthorizeDecision deny — NOT a 4xx error envelope. This is the
 *      contract that prevents the SDK from masking real denials as
 *      `pdp_invalid_response`/`sdk-invalid-response`.
 *   3. /v1/authorize with a malformed UCAN but a real customer header
 *      still produces an AuthorizeDecision shape (allow:false + receiptId).
 *   4. /v1/proxy mirrors the same — body must contain `{ allow, decision }`.
 *   5. Newly-added commands (post-2026-05-13 deploy) are in PDP's
 *      KNOWN_COMMANDS set: a request for /github/branch/list returns a
 *      deny whose reason is *not* `unknown_command`. If reason is
 *      `unknown_command`, the PDP hasn't rebuilt with the latest
 *      schema-packs and the deploy is incomplete.
 *
 * Env:
 *   PDP_URL            (default: https://pdp.auto-nomos.com)
 *   CONTROL_PLANE_URL  (default: https://api.auto-nomos.com)
 *   SMOKE_CUSTOMER_ID  (optional uuid; defaults to all-zeros)
 *
 * Exit non-zero on any failed assertion so CI / the deploy hook surfaces it.
 *
 * Run: pnpm tsx scripts/deploy-smoke.mts
 */

const PDP_URL = (process.env.PDP_URL ?? 'https://pdp.auto-nomos.com').replace(/\/+$/, '');
const CONTROL_PLANE_URL = (
  process.env.CONTROL_PLANE_URL ?? 'https://api.auto-nomos.com'
).replace(/\/+$/, '');
const CUSTOMER_ID = process.env.SMOKE_CUSTOMER_ID ?? '00000000-0000-0000-0000-000000000000';

interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
}

const results: CheckResult[] = [];

function record(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, ...(detail !== undefined ? { detail } : {}) });
}

async function expectStatus(
  name: string,
  url: string,
  init: RequestInit,
  status: number,
): Promise<Response | undefined> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    record(name, false, `fetch threw: ${(err as Error).message}`);
    return undefined;
  }
  if (res.status !== status) {
    record(name, false, `expected ${status}, got ${res.status}`);
    return undefined;
  }
  record(name, true);
  return res;
}

async function getJson(res: Response): Promise<Record<string, unknown> | undefined> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function isAuthorizeDecision(v: unknown): boolean {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r.allow === 'boolean' && typeof r.receiptId === 'string';
}

async function checkHealth(label: string, url: string): Promise<void> {
  const res = await expectStatus(`${label} /healthz 200`, `${url}/healthz`, {}, 200);
  if (!res) return;
  const body = await getJson(res);
  if (!body || body.ok !== true) {
    record(`${label} /healthz body.ok=true`, false, JSON.stringify(body));
    return;
  }
  record(`${label} /healthz body.ok=true`, true);
}

async function checkAuthorizeShape(): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${PDP_URL}/v1/authorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': CUSTOMER_ID },
      body: JSON.stringify({
        ucan: 'invalid.invalid.invalid',
        command: '/github/issue/create',
        resource: { repo: 'acme/billing' },
        context: {},
      }),
    });
  } catch (err) {
    record('authorize: reachable', false, (err as Error).message);
    return;
  }
  // Must be 200 (decision shape) — a 4xx leaks as pdp_invalid_response.
  record('authorize: 200 (not 4xx) on unknown customer', res.status === 200, `status=${res.status}`);
  const body = await getJson(res);
  if (!body) {
    record('authorize: body is JSON', false);
    return;
  }
  record('authorize: AuthorizeDecision shape (allow + receiptId)', isAuthorizeDecision(body), JSON.stringify(body));
  if (typeof body.allow === 'boolean') {
    record('authorize: allow === false', body.allow === false);
  }
  if (typeof body.reason === 'string') {
    record('authorize: reason populated', true, body.reason);
  } else {
    record('authorize: reason populated', false, 'reason missing');
  }
}

async function checkProxyShape(): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${PDP_URL}/v1/proxy/github/issue/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cb-customer': CUSTOMER_ID },
      body: JSON.stringify({
        ucan: 'invalid.invalid.invalid',
        request: {
          ucan: 'invalid.invalid.invalid',
          command: '/github/issue/create',
          resource: { repo: 'acme/billing' },
          context: {},
        },
        apiCall: { method: 'GET', path: '/repos/acme/billing' },
      }),
    });
  } catch (err) {
    record('proxy: reachable', false, (err as Error).message);
    return;
  }
  record('proxy: status 200 or 403 (not 4xx error envelope)', res.status === 200 || res.status === 403, `status=${res.status}`);
  const body = await getJson(res);
  if (!body) {
    record('proxy: body is JSON', false);
    return;
  }
  const decision = body.decision;
  record('proxy: body.decision present', typeof decision === 'object' && decision !== null, JSON.stringify(body));
  if (typeof decision === 'object' && decision !== null) {
    record('proxy: decision is AuthorizeDecision', isAuthorizeDecision(decision), JSON.stringify(decision));
  }
}

async function checkKnownCommands(): Promise<void> {
  // Probe a sample of commands added in the 2026-05-13 expansion. Each one
  // should be recognised by the deployed PDP — if not, the PDP wasn't
  // rebuilt with schema-packs ≥ 0.0.7 and the deploy is incomplete.
  const samples = [
    '/github/branch/list',
    '/github/pr/create',
    '/google/sheets/values/update',
    '/google/tasks/task/create',
    '/linear/issue/delete',
    '/stripe/invoice/list',
  ];
  for (const command of samples) {
    let res: Response;
    try {
      res = await fetch(`${PDP_URL}/v1/authorize`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-cb-customer': CUSTOMER_ID },
        body: JSON.stringify({
          ucan: 'invalid.invalid.invalid',
          command,
          resource: {},
          context: {},
        }),
      });
    } catch (err) {
      record(`known-command ${command}`, false, (err as Error).message);
      continue;
    }
    const body = (await getJson(res)) ?? {};
    // Pass condition: reason is NOT unknown_command. Any other deny reason
    // (unknown_customer, bad_signature, ...) is fine — it means the PDP
    // recognises the command and got past the KNOWN_COMMANDS gate.
    const reason = typeof body.reason === 'string' ? body.reason : undefined;
    record(
      `known-command ${command}`,
      reason !== 'unknown_command',
      `status=${res.status} reason=${reason ?? '(missing)'}`,
    );
  }
}

async function main(): Promise<void> {
  console.log(`PDP_URL=${PDP_URL}`);
  console.log(`CONTROL_PLANE_URL=${CONTROL_PLANE_URL}`);
  console.log(`SMOKE_CUSTOMER_ID=${CUSTOMER_ID}`);
  console.log('');

  await checkHealth('pdp', PDP_URL);
  await checkHealth('control-plane', CONTROL_PLANE_URL);
  await checkAuthorizeShape();
  await checkProxyShape();
  await checkKnownCommands();

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;

  for (const r of results) {
    const tag = r.ok ? 'PASS' : 'FAIL';
    console.log(`${tag}  ${r.name}${r.detail ? `   (${r.detail})` : ''}`);
  }
  console.log('');
  console.log(`${passed}/${results.length} checks passed`);
  if (failed > 0) {
    console.error(`${failed} failure(s) — deploy is unhealthy.`);
    process.exit(1);
  }
}

void main();
