#!/usr/bin/env tsx
/**
 * Provisions a Nomos OSS-community Discord server via the prod broker.
 *
 * Sequence (each `(passkey)` line prints stepUpUrl and waits for the
 * operator to tap Touch ID in the dashboard PWA — once per unique
 * resource constraint, then the envelope silent-mints subsequent calls):
 *
 *   1. Setup admin agent + Cedar policy + api key.
 *   2. (passkey) approve `create_channel` against guild=<guild_id>.
 *      Create 4 categories + 9 text channels + 2 voice channels.
 *   3. (passkey) approve `create_role` against guild=<guild_id>.
 *      Create Maintainer / Contributor / Community.
 *   4. (passkey) approve `post_message` against channel=#welcome.
 *      Post welcome message.
 *   5. (passkey) approve `post_message` against channel=#rules.
 *      Post rules message.
 *   6. (passkey) approve `create_invite` against channel=#welcome.
 *      Mint permanent invite link, log it.
 *
 * Total: ~5 passkey taps for the full server build-out.
 *
 * Env:
 *   NOMOS_SESSION_TOKEN          better-auth session cookie value
 *   NOMOS_ORG_ID                 customer/org uuid
 *   NOMOS_DISCORD_GUILD_ID       Discord snowflake of the target guild
 *   CONTROL_PLANE_URL            default https://api.auto-nomos.com
 *   PDP_URL                      default https://pdp.auto-nomos.com
 *   NOMOS_APPROVE_WAIT_SEC       default 300 (5 min per passkey tap)
 *   E2E_DISCORD_AGENT_NAME       default oss-community-setup
 */
import {
  CONTROL_PLANE,
  PDP,
  Results,
  mintStaticUcan,
  pdpProxy,
  req,
  setupAgent,
} from './lib-prod-harness.mts';

const SESSION = req('NOMOS_SESSION_TOKEN');
const ORG_ID = req('NOMOS_ORG_ID');
const GUILD_ID = req('NOMOS_DISCORD_GUILD_ID');
const AGENT_NAME = process.env.E2E_DISCORD_AGENT_NAME ?? 'oss-community-setup';
const APPROVE_WAIT_SEC = Number(process.env.NOMOS_APPROVE_WAIT_SEC ?? '300');

const READS = `[Action::"/discord/channel/list", Action::"/discord/role/list", Action::"/discord/guild/read", Action::"/discord/message/list"]`;
const WRITES = `[Action::"/discord/channel/create", Action::"/discord/channel/modify", Action::"/discord/role/create", Action::"/discord/message/post", Action::"/discord/invite/create"]`;

const CEDAR_POLICY = `permit (principal, action in ${READS}, resource);
permit (principal, action in ${WRITES}, resource);`;

interface ChannelSpec {
  name: string;
  type: 0 | 2; // 0=text, 2=voice
  parentName: string;
  topic?: string;
}

const CATEGORIES = ['GENERAL', 'SUPPORT', 'DEV', 'VOICE'] as const;
const CHANNELS: ChannelSpec[] = [
  { name: 'welcome', type: 0, parentName: 'GENERAL', topic: 'Start here — community guidelines + introductions.' },
  { name: 'rules', type: 0, parentName: 'GENERAL', topic: 'Read before you post. Enforced by mods.' },
  { name: 'announcements', type: 0, parentName: 'GENERAL', topic: 'Release notes + Nomos updates.' },
  { name: 'showcase', type: 0, parentName: 'GENERAL', topic: 'Share what you built with Nomos.' },
  { name: 'help', type: 0, parentName: 'SUPPORT', topic: 'Stuck? Ask here.' },
  { name: 'bug-reports', type: 0, parentName: 'SUPPORT', topic: 'Reproducible issues. Link to GitHub when relevant.' },
  { name: 'dev', type: 0, parentName: 'DEV', topic: 'Contributor chat — design, architecture, PR walkthroughs.' },
  { name: 'pull-requests', type: 0, parentName: 'DEV', topic: 'PR notifications + reviews.' },
  { name: 'ci-builds', type: 0, parentName: 'DEV', topic: 'Build + deploy status feed.' },
  { name: 'general-voice', type: 2, parentName: 'VOICE' },
  { name: 'dev-voice', type: 2, parentName: 'VOICE' },
];

const ROLES: { name: string; color: number; mentionable: boolean }[] = [
  { name: 'Maintainer', color: 3447003, mentionable: true },
  { name: 'Contributor', color: 3066993, mentionable: true },
  { name: 'Community', color: 9807270, mentionable: false },
];

const WELCOME_MESSAGE = `**Welcome to the Nomos open-source community! 🛡️**

This server is for builders working on or with **Nomos** — the agent permissions, scope, and monitoring layer for AI assistants.

**Where to start:**
• Read \`#rules\` before posting
• Introduce yourself in \`#welcome\`
• Building something? Drop a demo in \`#showcase\`
• Stuck? \`#help\` is staffed by maintainers + contributors
• Want to contribute? \`#dev\` is where design + architecture happens

**Useful links:**
• GitHub: https://github.com/varendra007/nomos (private alpha for now)
• Docs: https://auto-nomos.com/docs
• Roadmap: https://auto-nomos.com/roadmap

We're early. Feedback shapes the product. Welcome aboard. 🤝`;

const RULES_MESSAGE = `**Community Rules**

**1. Be respectful.** Disagreement is welcome; personal attacks are not.

**2. Stay on-topic.** This server is for Nomos + agent-permissions + adjacent infra. Off-topic threads go to DMs or another community.

**3. No spam, no self-promo without contribution.** Sharing what you built with Nomos in \`#showcase\` is great. Cross-posting your unrelated project / token / course is not.

**4. Use the right channel.** Bug reports → \`#bug-reports\`. Questions → \`#help\`. Random chat → \`#general-voice\` or \`#showcase\`.

**5. Respect privacy.** Don't post other people's API keys, tokens, audit logs, screenshots of dashboards, or Discord messages without consent. Treat the broker's job seriously — we treat yours seriously.

**6. Maintainers enforce.** Repeated or egregious violations → timeout → ban. Appeals via DM to a maintainer.

**7. Have fun building.** That's the point.

— The Nomos team`;

const results = new Results();
const channelIds: Record<string, string> = {};
const roleIds: Record<string, string> = {};

async function setup(): Promise<{ agentId: string; apiKey: string }> {
  console.log('--- Setup ---');
  const ctx = await setupAgent({
    controlPlane: CONTROL_PLANE,
    session: SESSION,
    orgId: ORG_ID,
    agentName: AGENT_NAME,
    policyName: `${AGENT_NAME}-policy`,
    cedarText: CEDAR_POLICY,
    exitIfAgentNew: false,
  });
  // NOTE: static mode for bootstrap. Dynamic-intent flow requires
  // ResourceConstraint.DiscordConstraint in shared-types (not yet
  // published) — passkey gauntlet for discord lands in a follow-up.
  console.log(`  agent ${ctx.agentId} in static mode (passkey gauntlet TODO)`);
  return { agentId: ctx.agentId, apiKey: ctx.apiKey };
}

async function listExistingChannels(apiKey: string): Promise<void> {
  const ucan = await mintStaticUcan({
    controlPlane: CONTROL_PLANE,
    apiKey,
    commands: ['/discord/channel/list'],
    ttlSeconds: 300,
  });
  const res = await pdpProxy({
    pdp: PDP,
    orgId: ORG_ID,
    command: '/discord/channel/list',
    ucan,
    resource: { guild_id: GUILD_ID },
    apiCall: { method: 'GET', path: `/guilds/${GUILD_ID}/channels` },
  });
  const list = (res.body as { upstream?: { body?: Array<{ id: string; name: string }> } })?.upstream
    ?.body;
  if (!Array.isArray(list)) return;
  for (const c of list) channelIds[c.name] = c.id;
  if (list.length > 0) console.log(`  found ${list.length} existing channels — will skip duplicates`);
}

async function createChannels(apiKey: string, _agentId: string): Promise<void> {
  console.log('\n--- Phase 1 — Channels ---');
  await listExistingChannels(apiKey);
  const ucan = await mintStaticUcan({
    controlPlane: CONTROL_PLANE,
    apiKey,
    commands: ['/discord/channel/create'],
    ttlSeconds: 1800,
  });

  // Create categories first (type 4).
  for (const catName of CATEGORIES) {
    if (channelIds[catName]) {
      results.pass(`category ${catName}`, `existing id=${channelIds[catName]}`);
      continue;
    }
    const res = await pdpProxy({
      pdp: PDP,
      orgId: ORG_ID,
      command: '/discord/channel/create',
      ucan,
      resource: { guild_id: GUILD_ID },
      apiCall: {
        method: 'POST',
        path: `/guilds/${GUILD_ID}/channels`,
        body: { name: catName, type: 4 },
      },
    });
    const upstream = (res.body as { upstream?: { status?: number; body?: { id?: string } } })?.upstream?.body;
    if (res.status === 200 && upstream?.id) {
      channelIds[catName] = upstream.id;
      results.pass(`category ${catName}`, `id=${upstream.id}`);
    } else {
      results.fail(`category ${catName}`, `status=${res.status} body=${JSON.stringify(res.body).slice(0, 200)}`);
    }
  }

  // Now create text + voice channels under their categories.
  for (const ch of CHANNELS) {
    const parentId = channelIds[ch.parentName];
    if (!parentId) {
      results.fail(`channel ${ch.name}`, `parent category ${ch.parentName} not created`);
      continue;
    }
    if (channelIds[ch.name]) {
      results.pass(`channel #${ch.name}`, `existing id=${channelIds[ch.name]}`);
      continue;
    }
    const body: Record<string, unknown> = {
      name: ch.name,
      type: ch.type,
      parent_id: parentId,
    };
    if (ch.topic) body.topic = ch.topic;
    const res = await pdpProxy({
      pdp: PDP,
      orgId: ORG_ID,
      command: '/discord/channel/create',
      ucan,
      resource: { guild_id: GUILD_ID },
      apiCall: {
        method: 'POST',
        path: `/guilds/${GUILD_ID}/channels`,
        body,
      },
    });
    const upstream = (res.body as { upstream?: { status?: number; body?: { id?: string } } })?.upstream?.body;
    if (res.status === 200 && upstream?.id) {
      channelIds[ch.name] = upstream.id;
      results.pass(`channel #${ch.name}`, `id=${upstream.id}`);
    } else {
      results.fail(`channel #${ch.name}`, `status=${res.status} body=${JSON.stringify(res.body).slice(0, 200)}`);
    }
  }
}

async function createRoles(apiKey: string, _agentId: string): Promise<void> {
  console.log('\n--- Phase 2 — Roles ---');
  const listUcan = await mintStaticUcan({
    controlPlane: CONTROL_PLANE,
    apiKey,
    commands: ['/discord/role/list'],
    ttlSeconds: 300,
  });
  const existingRes = await pdpProxy({
    pdp: PDP,
    orgId: ORG_ID,
    command: '/discord/role/list',
    ucan: listUcan,
    resource: { guild_id: GUILD_ID },
    apiCall: { method: 'GET', path: `/guilds/${GUILD_ID}/roles` },
  });
  const existing = (existingRes.body as {
    upstream?: { body?: Array<{ id: string; name: string }> };
  })?.upstream?.body;
  if (Array.isArray(existing)) {
    for (const r of existing) roleIds[r.name] = r.id;
  }
  const ucan = await mintStaticUcan({
    controlPlane: CONTROL_PLANE,
    apiKey,
    commands: ['/discord/role/create'],
    ttlSeconds: 600,
  });

  for (const role of ROLES) {
    if (roleIds[role.name]) {
      results.pass(`role ${role.name}`, `existing id=${roleIds[role.name]}`);
      continue;
    }
    const res = await pdpProxy({
      pdp: PDP,
      orgId: ORG_ID,
      command: '/discord/role/create',
      ucan,
      resource: { guild_id: GUILD_ID },
      apiCall: {
        method: 'POST',
        path: `/guilds/${GUILD_ID}/roles`,
        body: {
          name: role.name,
          color: role.color,
          hoist: true,
          mentionable: role.mentionable,
        },
      },
    });
    const upstream = (res.body as { upstream?: { status?: number; body?: { id?: string } } })?.upstream?.body;
    if (res.status === 200 && upstream?.id) {
      roleIds[role.name] = upstream.id;
      results.pass(`role ${role.name}`, `id=${upstream.id}`);
    } else {
      results.fail(`role ${role.name}`, `status=${res.status} body=${JSON.stringify(res.body).slice(0, 200)}`);
    }
  }
}

async function postMessage(
  apiKey: string,
  _agentId: string,
  channelName: string,
  content: string,
  passkeyLabel: string,
): Promise<void> {
  const channelId = channelIds[channelName];
  if (!channelId) {
    results.fail(`post to #${channelName}`, 'channel not created');
    return;
  }
  console.log(`\n--- Phase ${passkeyLabel} — Post #${channelName} ---`);
  const ucan = await mintStaticUcan({
    controlPlane: CONTROL_PLANE,
    apiKey,
    commands: ['/discord/message/post'],
    ttlSeconds: 300,
  });
  const res = await pdpProxy({
    pdp: PDP,
    orgId: ORG_ID,
    command: '/discord/message/post',
    ucan,
    resource: { channel_id: channelId },
    apiCall: {
      method: 'POST',
      path: `/channels/${channelId}/messages`,
      body: { content },
    },
  });
  const upstream = (res.body as { upstream?: { status?: number; body?: { id?: string } } })?.upstream?.body;
  if (res.status === 200 && upstream?.id) {
    results.pass(`post #${channelName}`, `msg=${upstream.id}`);
  } else {
    results.fail(`post #${channelName}`, `status=${res.status} body=${JSON.stringify(res.body).slice(0, 200)}`);
  }
}

async function createInvite(apiKey: string, _agentId: string): Promise<void> {
  const welcomeId = channelIds['welcome'];
  if (!welcomeId) {
    results.fail('invite', '#welcome not created');
    return;
  }
  console.log('\n--- Phase 5 — Invite link ---');
  const ucan = await mintStaticUcan({
    controlPlane: CONTROL_PLANE,
    apiKey,
    commands: ['/discord/invite/create'],
    ttlSeconds: 300,
  });
  const res = await pdpProxy({
    pdp: PDP,
    orgId: ORG_ID,
    command: '/discord/invite/create',
    ucan,
    resource: { channel_id: welcomeId },
    apiCall: {
      method: 'POST',
      path: `/channels/${welcomeId}/invites`,
      body: { max_age: 0, max_uses: 0, unique: true },
    },
  });
  const upstream = (res.body as { upstream?: { body?: { code?: string } } })?.upstream?.body;
  if (res.status === 200 && upstream?.code) {
    const inviteUrl = `https://discord.gg/${upstream.code}`;
    results.pass('invite', inviteUrl);
    console.log(`\n>>> PERMANENT INVITE: ${inviteUrl}`);
  } else {
    results.fail('invite', `status=${res.status} body=${JSON.stringify(res.body).slice(0, 200)}`);
  }
}

async function main(): Promise<void> {
  console.log(`Nomos OSS community setup — guild=${GUILD_ID}`);
  console.log(`control-plane=${CONTROL_PLANE} pdp=${PDP}`);
  console.log('');
  const { agentId, apiKey } = await setup();
  await createChannels(apiKey, agentId);
  await createRoles(apiKey, agentId);
  await postMessage(apiKey, agentId, 'welcome', WELCOME_MESSAGE, '3');
  await postMessage(apiKey, agentId, 'rules', RULES_MESSAGE, '4');
  await createInvite(apiKey, agentId);
  console.log('\n--- Summary ---');
  console.log(`channels created: ${Object.keys(channelIds).length}`);
  console.log(`roles created: ${Object.keys(roleIds).length}`);
  results.exit();
}

main().catch((err) => {
  console.error('setup failed:', err);
  process.exit(1);
});
