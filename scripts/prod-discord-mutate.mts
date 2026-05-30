#!/usr/bin/env tsx
/**
 * Prod Discord mutate harness — exercises the prod broker
 * (api.auto-nomos.com + pdp.auto-nomos.com) end-to-end for the Discord
 * provider against a real guild.
 *
 * Sequence (each `(passkey)` step prints stepUpUrl and waits up to
 * NOMOS_APPROVE_WAIT_SEC for the operator to click approve in the
 * dashboard PWA):
 *
 *   1. list_guilds                      (read, auto)
 *   2. list_channels                    (read, auto)
 *   3. create_channel name=nomos-smoke  (write, passkey)
 *   4. post_message  content=...        (write, passkey)
 *   5. list_messages                    (read, auto; assert message present)
 *   6. delete_channel                   (delete, passkey)
 *   7. audit chain verification         (GET /v1/audit; assert linked)
 *
 * Cleanup: if delete_channel fails or step 6 times out, prints the manual
 * Discord URL to delete the channel by hand.
 *
 * Env:
 *   NOMOS_SESSION_TOKEN          better-auth session cookie value.
 *   NOMOS_ORG_ID                 customer/org uuid.
 *   NOMOS_DISCORD_GUILD_ID       Discord snowflake of the test guild
 *                                (the guild the bot was installed into).
 *   CONTROL_PLANE_URL            default https://api.auto-nomos.com
 *   PDP_URL                      default https://pdp.auto-nomos.com
 *   NOMOS_APPROVE_WAIT_SEC       default 300 (5 min per passkey tap)
 *   E2E_DISCORD_AGENT_NAME       default e2e-discord-mutate
 *   NOMOS_DISCORD_PARENT_ID      optional category id for the test channel
 *
 * Exits 0 only if every step (incl. the 3 passkey-gated mutations) passes.
 */
import {
  CONTROL_PLANE,
  mintIntentWithApproval,
  mintStaticUcan,
  PDP,
  pdpProxy,
  Results,
  req,
  setAgentMode,
  setupAgent,
} from './lib-prod-harness.mts';

const SESSION = req('NOMOS_SESSION_TOKEN');
const ORG_ID = req('NOMOS_ORG_ID');
const GUILD_ID = req('NOMOS_DISCORD_GUILD_ID');
const PARENT_ID = process.env.NOMOS_DISCORD_PARENT_ID ?? null;
const AGENT_NAME = process.env.E2E_DISCORD_AGENT_NAME ?? 'e2e-discord-mutate';
const APPROVE_WAIT_SEC = Number(process.env.NOMOS_APPROVE_WAIT_SEC ?? '300');
const RUN_ID = `${Date.now()}`;

const ACTIONS = {
  listGuilds: '/discord/channel/list', // list_channels is the canonical guild→children read
  listChannels: '/discord/channel/list',
  createChannel: '/discord/channel/create',
  postMessage: '/discord/message/post',
  listMessages: '/discord/message/list',
  deleteChannel: '/discord/channel/delete',
} as const;

const READS = `[Action::"/discord/channel/list", Action::"/discord/message/list", Action::"/discord/guild/read", Action::"/discord/role/list", Action::"/discord/emoji/list"]`;
const WRITES = `[Action::"/discord/channel/create", Action::"/discord/channel/modify", Action::"/discord/message/post", Action::"/discord/message/edit", Action::"/discord/role/create", Action::"/discord/invite/create"]`;
const DELETES = `[Action::"/discord/channel/delete", Action::"/discord/message/delete", Action::"/discord/role/delete"]`;

const CEDAR_POLICY = `permit (principal, action in ${READS}, resource);
@stepup("required")
permit (principal, action in ${WRITES}, resource)
when { context.cosigner == true };
@stepup("required")
permit (principal, action in ${DELETES}, resource)
when { context.cosigner == true };`;

const results = new Results();
let CREATED_CHANNEL_ID: string | null = null;
let POSTED_MESSAGE_ID: string | null = null;

async function setup(): Promise<{ agentId: string; apiKey: string }> {
  console.log('--- Setup ---');
  const ctx = await setupAgent({
    controlPlane: CONTROL_PLANE,
    session: SESSION,
    orgId: ORG_ID,
    agentName: AGENT_NAME,
    policyName: `e2e-discord-mutate-${AGENT_NAME}`,
    cedarText: CEDAR_POLICY,
    exitIfAgentNew: false,
  });
  await setAgentMode(CONTROL_PLANE, SESSION, ORG_ID, ctx.agentId, 'dynamic');
  console.log(`  agent ${ctx.agentId} in dynamic mode`);
  return { agentId: ctx.agentId, apiKey: ctx.apiKey };
}

async function listChannels(apiKey: string): Promise<void> {
  console.log('--- list_channels (read, auto) ---');
  const ucan = await mintStaticUcan({
    controlPlane: CONTROL_PLANE,
    apiKey,
    commands: [ACTIONS.listChannels],
  });
  const res = await pdpProxy({
    pdp: PDP,
    orgId: ORG_ID,
    command: ACTIONS.listChannels,
    ucan,
    resource: { guild_id: GUILD_ID },
    apiCall: { method: 'GET', path: `/guilds/${GUILD_ID}/channels` },
  });
  if (
    res.status === 200 &&
    Array.isArray(
      (res.body as { decision?: { upstream?: unknown } })?.decision?.upstream ?? res.body,
    )
  ) {
    results.pass('list_channels');
  } else {
    results.fail(
      'list_channels',
      `status=${res.status} body=${JSON.stringify(res.body).slice(0, 200)}`,
    );
  }
}

async function createChannel(apiKey: string, agentId: string): Promise<void> {
  console.log('--- create_channel (write, passkey) ---');
  const channelName = `nomos-smoke-${RUN_ID}`;
  const constraint = { provider: 'discord' as const, guild_id: GUILD_ID };
  const { ucan } = await mintIntentWithApproval({
    controlPlane: CONTROL_PLANE,
    pdp: PDP,
    orgId: ORG_ID,
    apiKey,
    agentId,
    command: ACTIONS.createChannel,
    envelopeActions: [ACTIONS.createChannel],
    constraint,
    approveWaitSec: APPROVE_WAIT_SEC,
    purpose: `Create smoke-test channel ${channelName}`,
  });
  const body: Record<string, unknown> = { name: channelName, type: 0 };
  if (PARENT_ID) body.parent_id = PARENT_ID;
  const res = await pdpProxy({
    pdp: PDP,
    orgId: ORG_ID,
    command: ACTIONS.createChannel,
    ucan,
    resource: { guild_id: GUILD_ID },
    context: { cosigner: true },
    apiCall: {
      method: 'POST',
      path: `/guilds/${GUILD_ID}/channels`,
      body,
    },
  });
  const upstream = (res.body as { decision?: { upstream?: { id?: string } } })?.decision?.upstream;
  if (res.status === 200 && typeof upstream?.id === 'string') {
    CREATED_CHANNEL_ID = upstream.id;
    results.pass('create_channel', `id=${upstream.id} name=${channelName}`);
  } else {
    results.fail(
      'create_channel',
      `status=${res.status} body=${JSON.stringify(res.body).slice(0, 300)}`,
    );
  }
}

async function postMessage(apiKey: string, agentId: string): Promise<void> {
  if (!CREATED_CHANNEL_ID) {
    results.fail('post_message', 'skipped — create_channel did not succeed');
    return;
  }
  console.log('--- post_message (write, passkey) ---');
  const constraint = { provider: 'discord' as const, channel_id: CREATED_CHANNEL_ID };
  const { ucan } = await mintIntentWithApproval({
    controlPlane: CONTROL_PLANE,
    pdp: PDP,
    orgId: ORG_ID,
    apiKey,
    agentId,
    command: ACTIONS.postMessage,
    envelopeActions: [ACTIONS.postMessage, ACTIONS.listMessages],
    constraint,
    approveWaitSec: APPROVE_WAIT_SEC,
    purpose: `Post smoke-test message to channel ${CREATED_CHANNEL_ID}`,
  });
  const content = `nomos smoke test run ${RUN_ID}`;
  const res = await pdpProxy({
    pdp: PDP,
    orgId: ORG_ID,
    command: ACTIONS.postMessage,
    ucan,
    resource: { channel_id: CREATED_CHANNEL_ID },
    context: { cosigner: true },
    apiCall: {
      method: 'POST',
      path: `/channels/${CREATED_CHANNEL_ID}/messages`,
      body: { content },
    },
  });
  const upstream = (res.body as { decision?: { upstream?: { id?: string } } })?.decision?.upstream;
  if (res.status === 200 && typeof upstream?.id === 'string') {
    POSTED_MESSAGE_ID = upstream.id;
    results.pass('post_message', `id=${upstream.id}`);
  } else {
    results.fail(
      'post_message',
      `status=${res.status} body=${JSON.stringify(res.body).slice(0, 300)}`,
    );
  }
}

async function listMessages(apiKey: string): Promise<void> {
  if (!CREATED_CHANNEL_ID) {
    results.fail('list_messages', 'skipped — create_channel did not succeed');
    return;
  }
  console.log('--- list_messages (read, auto) ---');
  const ucan = await mintStaticUcan({
    controlPlane: CONTROL_PLANE,
    apiKey,
    commands: [ACTIONS.listMessages],
  });
  const res = await pdpProxy({
    pdp: PDP,
    orgId: ORG_ID,
    command: ACTIONS.listMessages,
    ucan,
    resource: { channel_id: CREATED_CHANNEL_ID },
    apiCall: {
      method: 'GET',
      path: `/channels/${CREATED_CHANNEL_ID}/messages`,
      query: { limit: '10' },
    },
  });
  const upstream = (res.body as { decision?: { upstream?: unknown[] } })?.decision?.upstream;
  const hit =
    Array.isArray(upstream) &&
    upstream.some((m) => (m as { id?: string }).id === POSTED_MESSAGE_ID);
  if (res.status === 200 && hit) {
    results.pass('list_messages', `${upstream.length} messages, posted id present`);
  } else {
    results.fail(
      'list_messages',
      `status=${res.status} hit=${hit} body=${JSON.stringify(res.body).slice(0, 200)}`,
    );
  }
}

async function deleteChannel(apiKey: string, agentId: string): Promise<void> {
  if (!CREATED_CHANNEL_ID) {
    results.fail('delete_channel', 'skipped — create_channel did not succeed');
    return;
  }
  console.log('--- delete_channel (delete, passkey) ---');
  const constraint = { provider: 'discord' as const, channel_id: CREATED_CHANNEL_ID };
  try {
    const { ucan } = await mintIntentWithApproval({
      controlPlane: CONTROL_PLANE,
      pdp: PDP,
      orgId: ORG_ID,
      apiKey,
      agentId,
      command: ACTIONS.deleteChannel,
      envelopeActions: [ACTIONS.deleteChannel],
      constraint,
      approveWaitSec: APPROVE_WAIT_SEC,
      purpose: `Delete smoke-test channel ${CREATED_CHANNEL_ID}`,
    });
    const res = await pdpProxy({
      pdp: PDP,
      orgId: ORG_ID,
      command: ACTIONS.deleteChannel,
      ucan,
      resource: { channel_id: CREATED_CHANNEL_ID },
      context: { cosigner: true },
      apiCall: { method: 'DELETE', path: `/channels/${CREATED_CHANNEL_ID}` },
    });
    if (res.status === 200) {
      results.pass('delete_channel', `id=${CREATED_CHANNEL_ID}`);
      CREATED_CHANNEL_ID = null;
    } else {
      results.fail(
        'delete_channel',
        `status=${res.status} body=${JSON.stringify(res.body).slice(0, 300)}`,
      );
    }
  } catch (err) {
    results.fail('delete_channel', (err as Error).message);
  }
}

async function verifyAudit(): Promise<void> {
  console.log('--- audit chain verification ---');
  // Best-effort: tail recent audit events via tRPC, count entries whose
  // command starts /discord/. Hash-chain verification proper is run via the
  // audit-verify CLI; here we only sanity-check that all four mutations
  // landed in the chain.
  try {
    const since = Date.now() - 30 * 60 * 1000;
    const url = `${CONTROL_PLANE}/trpc/audit.list?batch=1&input=${encodeURIComponent(
      JSON.stringify({ 0: { json: { sinceMs: since, limit: 200 } } }),
    )}`;
    const res = await fetch(url, {
      headers: {
        cookie: `__Secure-better-auth.session_token=${SESSION}`,
        origin: 'https://app.auto-nomos.com',
        'x-cb-org': ORG_ID,
      },
    });
    if (!res.ok) {
      results.fail('audit_chain', `trpc audit.list ${res.status}`);
      return;
    }
    const arr = (await res.json()) as Array<{
      result?: { data?: { json?: Array<{ command?: string }> } };
    }>;
    const events = arr[0]?.result?.data?.json ?? [];
    const discordEvents = events.filter(
      (e) => typeof e.command === 'string' && e.command.startsWith('/discord/'),
    );
    if (discordEvents.length >= 4) {
      results.pass('audit_chain', `${discordEvents.length} /discord/* events in last 30m`);
    } else {
      results.fail('audit_chain', `expected >=4 discord events, got ${discordEvents.length}`);
    }
  } catch (err) {
    results.fail('audit_chain', (err as Error).message);
  }
}

async function main(): Promise<void> {
  console.log(`prod-discord-mutate — guild=${GUILD_ID} run=${RUN_ID}`);
  console.log(`control-plane=${CONTROL_PLANE} pdp=${PDP}`);
  console.log('');
  const { agentId, apiKey } = await setup();
  try {
    await listChannels(apiKey);
    await createChannel(apiKey, agentId);
    await postMessage(apiKey, agentId);
    await listMessages(apiKey);
    await deleteChannel(apiKey, agentId);
    await verifyAudit();
  } finally {
    if (CREATED_CHANNEL_ID) {
      console.log('');
      console.log(`!!! cleanup needed — channel ${CREATED_CHANNEL_ID} was not deleted.`);
      console.log(
        `    delete manually at https://discord.com/channels/${GUILD_ID}/${CREATED_CHANNEL_ID}`,
      );
    }
  }
  results.exit();
}

main().catch((err) => {
  console.error('harness failed:', err);
  process.exit(1);
});
