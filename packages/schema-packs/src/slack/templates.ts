import type { PolicyTemplate } from '../types.js';

export const READS = [
  '/slack/channel/list',
  '/slack/channel/history',
  '/slack/channel/read',
  '/slack/message/read',
  '/slack/message/search',
  '/slack/user/read',
  '/slack/user/list',
  '/slack/user/lookup',
  '/slack/file/list',
  '/slack/file/read',
] as const;
export const WRITES = [
  '/slack/message/post',
  '/slack/message/update',
  '/slack/message/react',
  '/slack/message/unreact',
  '/slack/message/reply',
  '/slack/message/pin',
  '/slack/message/schedule',
  '/slack/channel/create',
  '/slack/channel/invite',
  '/slack/channel/topic',
  '/slack/channel/archive',
  '/slack/channel/unarchive',
  '/slack/channel/leave',
  '/slack/dm/open',
  '/slack/file/upload',
] as const;
export const DELETES = ['/slack/message/delete', '/slack/file/delete'] as const;
export const actions = [...READS, ...WRITES, ...DELETES] as const;

const READ_LIST = READS.map((a) => `Action::"${a}"`).join(', ');
const WRITE_LIST = WRITES.map((a) => `Action::"${a}"`).join(', ');

export const templates: PolicyTemplate[] = [
  {
    id: 'slack:read-only',
    integrationId: 'slack',
    name: 'Read-only',
    description: 'List channels, read history and messages. No posting.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'slack:read-and-write-own',
    integrationId: 'slack',
    name: 'Read & write own',
    description: 'Read everything; only post or edit messages authored by the user.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n);\n\npermit (\n  principal,\n  action in [${WRITE_LIST}],\n  resource\n)\nwhen { resource.owner_did == context.user.did };`,
    visualReady: false,
  },
  {
    id: 'slack:time-bounded',
    integrationId: 'slack',
    name: 'Time-bounded access',
    description: 'Allow any action only during business hours (09:00–17:00 UTC).',
    cedarText:
      'permit (\n  principal,\n  action,\n  resource\n)\nwhen { context.time.hour >= 9 && context.time.hour < 17 };',
    visualReady: true,
  },
  {
    id: 'slack:step-up-write',
    integrationId: 'slack',
    name: 'Step-up for posts',
    description: 'Reads always; posts and channel creation require a co-signer approval.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n);\n\npermit (\n  principal,\n  action in [${WRITE_LIST}],\n  resource\n)\nwhen { context.cosigner == true };`,
    visualReady: true,
  },
  {
    id: 'slack:read-public-write-private',
    integrationId: 'slack',
    name: 'Read public, write private',
    description: 'Read public channels; post only in private channels.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n)\nwhen { resource.visibility == "public" };\n\npermit (\n  principal,\n  action in [${WRITE_LIST}],\n  resource\n)\nwhen { resource.visibility == "private" };`,
    visualReady: true,
  },
];
