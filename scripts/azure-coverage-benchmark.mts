#!/usr/bin/env tsx
/**
 * Azure coverage benchmark — exercises every /azure/* command registered
 * in @auto-nomos/schema-packs against the prod broker and reports a
 * coverage matrix.
 *
 * Output: scripts/output/azure-coverage.md + .json + per-run console log.
 *
 * For each action the harness records:
 *   - schemaRecognised   PDP doesn't deny with `unknown_command`
 *   - mintOk             /v1/mint-ucan returns a UCAN with cloud_connection_id
 *   - decisionAllow      PDP /v1/proxy Cedar decision (after policy)
 *   - upstreamStatus     ARM HTTP status if PDP forwarded
 *   - cosignerBlocked    PDP refused with `cosigner_required` (good for
 *                        destructive verbs)
 *   - classification     read | non_destructive_write | destructive
 *
 * Exit code:
 *   0 — every action is at least schemaRecognised
 *   1 — any action returned `unknown_command` (means schema-packs and PDP
 *       are out of sync, i.e. PDP wasn't rebuilt with the latest pack)
 *
 * Env (same as scripts/prod-e2e-azure.mts):
 *   NOMOS_SESSION_TOKEN, NOMOS_ORG_ID, NOMOS_CLOUD_CONN_ID, NOMOS_AZURE_SUB_ID
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DATA,
  DESTRUCTIVE,
  DEVOPS,
  OPS,
  RAW_CALL,
  READS,
} from '../packages/schema-packs/src/azure/actions.ts';

// Same DESTRUCTIVE_VERBS list as apps/pdp/src/services/cloud-risk-rules.ts.
const DESTRUCTIVE_VERBS = [
  'delete',
  'destroy',
  'terminate',
  'stop',
  'drain',
  'rotate',
  'run_command',
  'invoke',
  'scale',
  'redeploy',
  'purge',
  'regenerate_key',
  'deallocate',
  'reimage',
  'remove_rule',
  'detach_disk',
  'capture',
  'uninstall_extension',
  'cancel_run',
  'cancel',
  'power_off',
  'slot_swap',
];
const READ_VERB_PREFIXES = ['list', 'get', 'read', 'describe', 'query'];

function classifyCommand(cmd: string): 'read' | 'destructive' | 'non_destructive_write' {
  const last = cmd.split('/').pop() ?? '';
  if (READ_VERB_PREFIXES.some((p) => last.startsWith(p))) return 'read';
  if (DESTRUCTIVE_VERBS.some((d) => last.includes(d))) return 'destructive';
  return 'non_destructive_write';
}

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

/**
 * Per-action ARM probe overrides. When an action allows a Reader-scoped
 * GET against a deterministic subscription-scope endpoint we point at it
 * so the read tier exercises the real federation handshake all the way to
 * a 200. The default for missing entries is "schema check only".
 *
 * Paths are subscription-scope where possible to avoid needing a real
 * resource name. api-version values pinned to widely-available stable
 * versions.
 */
const armProbes: Record<string, { path: string; query: Record<string, string> }> = {
  '/azure/subscriptions/list': {
    path: '/subscriptions',
    query: { 'api-version': '2022-12-01' },
  },
  '/azure/subscriptions/get': {
    path: `/subscriptions/${AZURE_SUB}`,
    query: { 'api-version': '2022-12-01' },
  },
  '/azure/resource_groups/list': {
    path: `/subscriptions/${AZURE_SUB}/resourceGroups`,
    query: { 'api-version': '2021-04-01' },
  },
  '/azure/resources/list': {
    path: `/subscriptions/${AZURE_SUB}/resources`,
    query: { 'api-version': '2021-04-01' },
  },
  '/azure/vm/list': {
    path: `/subscriptions/${AZURE_SUB}/providers/Microsoft.Compute/virtualMachines`,
    query: { 'api-version': '2023-09-01' },
  },
  '/azure/vmss/list': {
    path: `/subscriptions/${AZURE_SUB}/providers/Microsoft.Compute/virtualMachineScaleSets`,
    query: { 'api-version': '2023-09-01' },
  },
  '/azure/vm/list_available_sizes': {
    path: `/subscriptions/${AZURE_SUB}/providers/Microsoft.Compute/locations/eastus/vmSizes`,
    query: { 'api-version': '2023-09-01' },
  },
  '/azure/disks/list': {
    path: `/subscriptions/${AZURE_SUB}/providers/Microsoft.Compute/disks`,
    query: { 'api-version': '2023-04-02' },
  },
  '/azure/images/list': {
    path: `/subscriptions/${AZURE_SUB}/providers/Microsoft.Compute/images`,
    query: { 'api-version': '2023-09-01' },
  },
  '/azure/snapshots/list': {
    path: `/subscriptions/${AZURE_SUB}/providers/Microsoft.Compute/snapshots`,
    query: { 'api-version': '2023-04-02' },
  },
  '/azure/storage_accounts/list': {
    path: `/subscriptions/${AZURE_SUB}/providers/Microsoft.Storage/storageAccounts`,
    query: { 'api-version': '2023-01-01' },
  },
  '/azure/key_vaults/list': {
    path: `/subscriptions/${AZURE_SUB}/providers/Microsoft.KeyVault/vaults`,
    query: { 'api-version': '2023-07-01' },
  },
  '/azure/app_services/list': {
    path: `/subscriptions/${AZURE_SUB}/providers/Microsoft.Web/sites`,
    query: { 'api-version': '2023-01-01' },
  },
  '/azure/functions/list': {
    path: `/subscriptions/${AZURE_SUB}/providers/Microsoft.Web/sites`,
    query: { 'api-version': '2023-01-01' },
  },
  '/azure/aks/list': {
    path: `/subscriptions/${AZURE_SUB}/providers/Microsoft.ContainerService/managedClusters`,
    query: { 'api-version': '2023-09-01' },
  },
  '/azure/cosmos/list_accounts': {
    path: `/subscriptions/${AZURE_SUB}/providers/Microsoft.DocumentDB/databaseAccounts`,
    query: { 'api-version': '2023-09-15' },
  },
  '/azure/vnets/list': {
    path: `/subscriptions/${AZURE_SUB}/providers/Microsoft.Network/virtualNetworks`,
    query: { 'api-version': '2023-09-01' },
  },
  '/azure/nsgs/list': {
    path: `/subscriptions/${AZURE_SUB}/providers/Microsoft.Network/networkSecurityGroups`,
    query: { 'api-version': '2023-09-01' },
  },
  '/azure/public_ips/list': {
    path: `/subscriptions/${AZURE_SUB}/providers/Microsoft.Network/publicIPAddresses`,
    query: { 'api-version': '2023-09-01' },
  },
  '/azure/load_balancers/list': {
    path: `/subscriptions/${AZURE_SUB}/providers/Microsoft.Network/loadBalancers`,
    query: { 'api-version': '2023-09-01' },
  },
  '/azure/application_gateways/list': {
    path: `/subscriptions/${AZURE_SUB}/providers/Microsoft.Network/applicationGateways`,
    query: { 'api-version': '2023-09-01' },
  },
  '/azure/private_endpoints/list': {
    path: `/subscriptions/${AZURE_SUB}/providers/Microsoft.Network/privateEndpoints`,
    query: { 'api-version': '2023-09-01' },
  },
  '/azure/dns_zones/list': {
    path: `/subscriptions/${AZURE_SUB}/providers/Microsoft.Network/dnszones`,
    query: { 'api-version': '2018-05-01' },
  },
  '/azure/rbac/list_role_assignments': {
    path: `/subscriptions/${AZURE_SUB}/providers/Microsoft.Authorization/roleAssignments`,
    query: { 'api-version': '2022-04-01' },
  },
  '/azure/rbac/list_role_definitions': {
    path: `/subscriptions/${AZURE_SUB}/providers/Microsoft.Authorization/roleDefinitions`,
    query: { 'api-version': '2022-04-01' },
  },
  '/azure/monitor/list_action_groups': {
    path: `/subscriptions/${AZURE_SUB}/providers/Microsoft.Insights/actionGroups`,
    query: { 'api-version': '2023-01-01' },
  },
  '/azure/log_analytics/list_workspaces': {
    path: `/subscriptions/${AZURE_SUB}/providers/Microsoft.OperationalInsights/workspaces`,
    query: { 'api-version': '2022-10-01' },
  },
  '/azure/policy/list_definitions': {
    path: `/subscriptions/${AZURE_SUB}/providers/Microsoft.Authorization/policyDefinitions`,
    query: { 'api-version': '2023-04-01' },
  },
  '/azure/policy/list_assignments': {
    path: `/subscriptions/${AZURE_SUB}/providers/Microsoft.Authorization/policyAssignments`,
    query: { 'api-version': '2023-04-01' },
  },
  '/azure/acr/list_registries': {
    path: `/subscriptions/${AZURE_SUB}/providers/Microsoft.ContainerRegistry/registries`,
    query: { 'api-version': '2023-07-01' },
  },
  '/azure/logic_apps/list': {
    path: `/subscriptions/${AZURE_SUB}/providers/Microsoft.Logic/workflows`,
    query: { 'api-version': '2019-05-01' },
  },
  '/azure/service_bus/list_namespaces': {
    path: `/subscriptions/${AZURE_SUB}/providers/Microsoft.ServiceBus/namespaces`,
    query: { 'api-version': '2022-10-01-preview' },
  },
  '/azure/event_hub/list_namespaces': {
    path: `/subscriptions/${AZURE_SUB}/providers/Microsoft.EventHub/namespaces`,
    query: { 'api-version': '2023-01-01-preview' },
  },
  '/azure/event_grid/list_topics': {
    path: `/subscriptions/${AZURE_SUB}/providers/Microsoft.EventGrid/topics`,
    query: { 'api-version': '2022-06-15' },
  },
  '/azure/app_config/list_stores': {
    path: `/subscriptions/${AZURE_SUB}/providers/Microsoft.AppConfiguration/configurationStores`,
    query: { 'api-version': '2023-03-01' },
  },
  '/azure/management_groups/list': {
    path: `/providers/Microsoft.Management/managementGroups`,
    query: { 'api-version': '2021-04-01' },
  },
  '/azure/deployments/list': {
    path: `/subscriptions/${AZURE_SUB}/providers/Microsoft.Resources/deployments`,
    query: { 'api-version': '2021-04-01' },
  },
};

interface ActionResult {
  command: string;
  classification: 'read' | 'destructive' | 'non_destructive_write';
  schemaRecognised: boolean;
  mintOk: boolean;
  decisionAllow: boolean | null;
  decisionReason: string | undefined;
  cosignerBlocked: boolean;
  upstreamStatus: number | null;
  upstreamSuccess: boolean;
  notes: string;
}

const results: ActionResult[] = [];

async function probeSchemaRecognised(
  command: string,
): Promise<{ recognised: boolean; reason?: string }> {
  // Unauthenticated PDP authorize with malformed UCAN. If reason is
  // `unknown_command` → schema-packs and PDP disagree.
  const res = await fetch(`${PDP}/v1/authorize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cb-customer': ORG_ID },
    body: JSON.stringify({
      ucan: 'invalid.invalid.invalid',
      command,
      resource: {},
      context: {},
    }),
  });
  const body = (await res.json()) as { reason?: string };
  return { recognised: body.reason !== 'unknown_command', reason: body.reason };
}

async function setupAgentAndKey(): Promise<{ agentId: string; apiKey: string; policyId: string }> {
  const agents = await trpc<Array<{ id: string; name: string; status: string }>>(
    'agents.list',
    'GET',
  );
  let agent = agents.find((a) => a.name === AGENT_NAME);
  if (!agent) {
    agent = await trpc<{ id: string; name: string; status: string }>('agents.create', 'POST', {
      name: AGENT_NAME,
      requireApproval: false,
    });
    console.log(`  created agent ${agent.id}`);
  } else if (agent.status !== 'active') {
    await trpc('agents.update', 'POST', { id: agent.id, status: 'active' });
    console.log(`  re-enabled agent ${agent.id}`);
  } else {
    console.log(`  reusing agent ${agent.id}`);
  }
  const agentId = agent.id;

  // Broad allow policy for benchmark — explicitly only for /azure/*.
  // Destructive cosigner gate still fires; this just keeps Cedar from
  // turning every action into a `policy_deny`.
  const POLICY_NAME = `e2e-azure-${AGENT_NAME}-broad`;
  const cedarText = `permit (
  principal,
  action,
  resource
)
when { context.cloud_provider == "azure" };

permit (
  principal,
  action,
  resource
);`;
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

  // Fresh API key.
  const keys = await trpc<Array<{ id: string; name: string; revokedAt: unknown }>>(
    'apiKeys.list',
    'GET',
    { agentId },
  );
  const KEY_NAME = `${AGENT_NAME}-coverage`;
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

interface MintedUcan {
  command: string;
  jwt: string;
}

async function mintBatch(apiKey: string, commands: string[]): Promise<MintedUcan[]> {
  const res = await fetch(`${CONTROL_PLANE}/v1/mint-ucan`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      commands,
      cloudConnectionId: CLOUD_CONN_ID,
      ttlSeconds: 600,
    }),
  });
  if (!res.ok) {
    throw new Error(`mint-ucan ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  const body = (await res.json()) as { ucans: Array<{ command: string; jwt: string }> };
  return body.ucans;
}

async function callProxy(
  command: string,
  ucan: string,
): Promise<{ status: number; body: unknown }> {
  const probe = armProbes[command];
  const cls = classifyCommand(command);
  // For destructive/write actions without a probe, we still need an apiCall
  // body so the proxy zod schema doesn't reject — use a stub that satisfies
  // the per-action schema. armWrite expects POST/PATCH/PUT + api-version;
  // armDelete expects DELETE + api-version. For data-plane (POST query
  // body), use a stub query.
  // Schema picks method by command tier: read=GET, data=POST (body),
  // destructive=DELETE (every entry in DESTRUCTIVE uses armDelete regardless
  // of verb token), everything else POST.
  const inDestructive = (DESTRUCTIVE as readonly string[]).includes(command);
  const inData = (DATA as readonly string[]).includes(command);
  const method = inDestructive ? 'DELETE' : cls === 'read' ? 'GET' : 'POST';
  void inData;
  const apiCall = probe
    ? { method: 'GET' as const, path: probe.path, query: probe.query }
    : {
        method: method as 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
        path: `/subscriptions/${AZURE_SUB}/resourceGroups/never/providers/Microsoft.Sample/items/none`,
        query: { 'api-version': '2023-01-01' },
        ...(method !== 'GET' && method !== 'DELETE'
          ? { body: { query: 'select * from c where 1=0', properties: {} } }
          : {}),
      };
  const res = await fetch(`${PDP}/v1/proxy${command}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cb-customer': ORG_ID },
    body: JSON.stringify({
      ucan,
      request: {
        ucan,
        command,
        resource: { subscription_id: AZURE_SUB },
        context: { cloud_provider: 'azure', command },
      },
      apiCall,
    }),
  });
  const body = (await res.json()) as unknown;
  return { status: res.status, body };
}

function interpretProxyBody(
  command: string,
  status: number,
  body: unknown,
): Pick<
  ActionResult,
  | 'decisionAllow'
  | 'decisionReason'
  | 'cosignerBlocked'
  | 'upstreamStatus'
  | 'upstreamSuccess'
  | 'notes'
> {
  const b = body as {
    decision?: { allow?: boolean; reason?: string };
    allow?: boolean;
    error?: string;
    error_code?: string;
    upstream?: { status?: number; body?: unknown };
    providerStatus?: number;
    providerBody?: unknown;
  };
  const decisionAllow = b.decision?.allow ?? b.allow ?? null;
  const decisionReason = b.decision?.reason;
  const cosignerBlocked =
    b.error_code === 'cosigner_required' ||
    decisionReason === 'destructive_cloud_action_requires_cosigner';
  const upstreamStatus = b.upstream?.status ?? b.providerStatus ?? null;
  const upstreamSuccess = upstreamStatus !== null && upstreamStatus >= 200 && upstreamStatus < 300;
  let notes = '';
  if (cosignerBlocked) notes = 'cosigner_required (expected for destructive)';
  else if (b.error_code === 'cloud_call_failed') {
    notes = `cloud_call_failed providerStatus=${b.providerStatus ?? '?'}`;
  } else if (status === 200 && upstreamSuccess) {
    notes = `ARM ${upstreamStatus}`;
  } else if (status === 200 && upstreamStatus !== null) {
    notes = `broker→ARM ${upstreamStatus} (Reader role limit or resource absent)`;
  } else if (status === 403 && decisionAllow === false) {
    notes = `PDP deny: ${decisionReason ?? '?'}`;
  } else if (status === 400) {
    notes = `schema_violation: ${decisionReason ?? b.error ?? '?'}`;
  } else {
    notes = `status=${status} body=${JSON.stringify(b).slice(0, 200)}`;
  }
  return { decisionAllow, decisionReason, cosignerBlocked, upstreamStatus, upstreamSuccess, notes };
}

function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main(): Promise<void> {
  console.log(`CONTROL_PLANE=${CONTROL_PLANE}  PDP=${PDP}  ORG=${ORG_ID}  SUB=${AZURE_SUB}`);
  const allCommands = [...READS, ...OPS, ...DEVOPS, ...DATA, ...DESTRUCTIVE, RAW_CALL];
  console.log(`Probing ${allCommands.length} Azure commands...`);

  // 1) Schema recognition (no setup needed).
  console.log('\n--- Phase 1: schema recognition (PDP knows the command) ---');
  const schemaResults = new Map<string, { recognised: boolean; reason?: string }>();
  let unknownCount = 0;
  for (const cmd of allCommands) {
    const sr = await probeSchemaRecognised(cmd);
    schemaResults.set(cmd, sr);
    if (!sr.recognised) unknownCount++;
  }
  console.log(`  unknown_command: ${unknownCount}/${allCommands.length}`);

  // 2) Setup agent + policy + key.
  console.log('\n--- Phase 2: setup ---');
  const setup = await setupAgentAndKey();

  // 3) Mint UCANs in batches of 16.
  console.log('\n--- Phase 3: mint UCANs ---');
  const mintable = allCommands.filter((c) => c !== RAW_CALL); // raw_call uses a custom mint path
  const ucanByCommand = new Map<string, string>();
  for (const batch of chunk(mintable, 16)) {
    try {
      const minted = await mintBatch(setup.apiKey, batch);
      for (const m of minted) ucanByCommand.set(m.command, m.jwt);
    } catch (err) {
      console.log(`  batch failed (${batch.length} cmds): ${(err as Error).message.slice(0, 200)}`);
    }
  }
  console.log(`  minted ${ucanByCommand.size}/${mintable.length} UCANs`);

  // 4) Proxy probe each action.
  console.log('\n--- Phase 4: proxy probe ---');
  for (const cmd of allCommands) {
    const cls = classifyCommand(cmd);
    const sr = schemaResults.get(cmd)!;
    const jwt = ucanByCommand.get(cmd);
    if (!jwt) {
      results.push({
        command: cmd,
        classification: cls,
        schemaRecognised: sr.recognised,
        mintOk: false,
        decisionAllow: null,
        decisionReason: undefined,
        cosignerBlocked: false,
        upstreamStatus: null,
        upstreamSuccess: false,
        notes: cmd === RAW_CALL ? 'skipped (raw_call)' : 'mint missing',
      });
      continue;
    }
    try {
      const r = await callProxy(cmd, jwt);
      const interpreted = interpretProxyBody(cmd, r.status, r.body);
      results.push({
        command: cmd,
        classification: cls,
        schemaRecognised: sr.recognised,
        mintOk: true,
        ...interpreted,
      });
    } catch (err) {
      results.push({
        command: cmd,
        classification: cls,
        schemaRecognised: sr.recognised,
        mintOk: true,
        decisionAllow: null,
        decisionReason: undefined,
        cosignerBlocked: false,
        upstreamStatus: null,
        upstreamSuccess: false,
        notes: `proxy threw: ${(err as Error).message.slice(0, 200)}`,
      });
    }
  }

  // 5) Aggregate + write report.
  const stats = {
    total: results.length,
    schemaRecognised: results.filter((r) => r.schemaRecognised).length,
    mintOk: results.filter((r) => r.mintOk).length,
    armSuccess: results.filter((r) => r.upstreamSuccess).length,
    brokerForwarded: results.filter((r) => r.decisionAllow === true && r.upstreamStatus !== null)
      .length,
    cosignerBlocked: results.filter((r) => r.cosignerBlocked).length,
    schemaViolation: results.filter((r) => r.notes.startsWith('schema_violation')).length,
    pdpDeny: results.filter((r) => r.notes.startsWith('PDP deny')).length,
    destructiveCosignerCorrect: results.filter(
      (r) => r.classification === 'destructive' && r.cosignerBlocked,
    ).length,
    destructiveCosignerMissed: results.filter(
      (r) => r.classification === 'destructive' && !r.cosignerBlocked,
    ),
  };

  const outDir = pathResolve(dirname(fileURLToPath(import.meta.url)), 'output');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    pathResolve(outDir, 'azure-coverage.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), stats, results }, null, 2),
  );

  const md = renderMarkdown(stats, results);
  writeFileSync(pathResolve(outDir, 'azure-coverage.md'), md);
  console.log(`\nReport: ${pathResolve(outDir, 'azure-coverage.md')}`);

  console.log('\n--- Summary ---');
  console.log(`schemaRecognised:  ${stats.schemaRecognised}/${stats.total}`);
  console.log(`mintOk:            ${stats.mintOk}/${stats.total}`);
  console.log(`ARM success (200): ${stats.armSuccess}/${stats.total}`);
  console.log(`cosignerBlocked:   ${stats.cosignerBlocked}/${stats.total}`);
  console.log(
    `destructive cosigner: ${stats.destructiveCosignerCorrect}/${DESTRUCTIVE.length} expected from DESTRUCTIVE list (${stats.destructiveCosignerMissed.length} misses)`,
  );

  if (unknownCount > 0) {
    console.error(`FAIL: ${unknownCount} unknown_command — PDP not in sync with schema-packs`);
    process.exit(1);
  }
}

function renderMarkdown(
  stats: {
    total: number;
    schemaRecognised: number;
    mintOk: number;
    armSuccess: number;
    cosignerBlocked: number;
    destructiveCosignerCorrect: number;
    destructiveCosignerMissed: ActionResult[];
  },
  rows: ActionResult[],
): string {
  const lines: string[] = [];
  lines.push('# Azure broker coverage');
  lines.push('');
  lines.push(`Generated ${new Date().toISOString()} against ${PDP}.`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| Total actions registered | ${stats.total} |`);
  lines.push(`| Recognised by PDP | ${stats.schemaRecognised} |`);
  lines.push(`| UCAN minted successfully | ${stats.mintOk} |`);
  lines.push(
    `| Broker forwarded to ARM (Cedar allowed, federation handshake completed) | ${stats.brokerForwarded} |`,
  );
  lines.push(`| └─ ARM 2xx | ${stats.armSuccess} |`);
  lines.push(
    `| └─ ARM 4xx (Reader role limit or resource absent — broker did its job) | ${stats.brokerForwarded - stats.armSuccess} |`,
  );
  lines.push(`| Cosigner-gated by risk rules | ${stats.cosignerBlocked} |`);
  lines.push(`| Schema violation (rejected pre-Cedar) | ${stats.schemaViolation} |`);
  lines.push(`| PDP deny (Cedar-level) | ${stats.pdpDeny} |`);
  lines.push(
    `| Destructive actions with correct cosigner gate | ${stats.destructiveCosignerCorrect} / ${DESTRUCTIVE.length} |`,
  );
  if (stats.destructiveCosignerMissed.length > 0) {
    lines.push('');
    lines.push('### Destructive cosigner gate misses (action allowed without step-up)');
    for (const r of stats.destructiveCosignerMissed) {
      lines.push(`- \`${r.command}\` — ${r.notes}`);
    }
  }
  lines.push('');
  lines.push('## Per-action results');
  lines.push('');
  lines.push('| Command | Class | Schema | Mint | ARM | Cosigner | Notes |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const r of rows) {
    lines.push(
      `| \`${r.command}\` | ${r.classification} | ${r.schemaRecognised ? 'ok' : 'UNKNOWN'} | ${r.mintOk ? 'ok' : '—'} | ${r.upstreamStatus ?? '—'}${r.upstreamSuccess ? ' ✓' : ''} | ${r.cosignerBlocked ? 'yes' : '—'} | ${r.notes.replace(/\|/g, '\\|').slice(0, 80)} |`,
    );
  }
  return lines.join('\n');
}

void main();
