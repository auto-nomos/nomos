import type { PolicyTemplate } from '../types.js';

export const READS = [
  '/discord/guild/read',
  '/discord/guild/members',
  '/discord/channel/list',
  '/discord/channel/read',
  '/discord/message/list',
  '/discord/role/list',
  '/discord/emoji/list',
] as const;
export const WRITES = [
  '/discord/guild/modify',
  '/discord/channel/create',
  '/discord/channel/modify',
  '/discord/channel/permissions',
  '/discord/message/post',
  '/discord/message/edit',
  '/discord/role/create',
  '/discord/role/modify',
  '/discord/member/add_role',
  '/discord/member/remove_role',
  '/discord/invite/create',
  '/discord/webhook/create',
] as const;
export const DELETES = [
  '/discord/channel/delete',
  '/discord/message/delete',
  '/discord/role/delete',
] as const;
export const actions = [...READS, ...WRITES, ...DELETES] as const;

const READ_LIST = READS.map((a) => `Action::"${a}"`).join(', ');
const WRITE_LIST = WRITES.map((a) => `Action::"${a}"`).join(', ');
const DELETE_LIST = DELETES.map((a) => `Action::"${a}"`).join(', ');

export const templates: PolicyTemplate[] = [
  {
    id: 'discord:read-only',
    integrationId: 'discord',
    name: 'Read-only',
    description: 'List channels/roles, read messages and member rosters. No posting or mutation.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'discord:read-and-write',
    integrationId: 'discord',
    name: 'Read & write (no destructive)',
    description: 'Read everything; post + edit messages, create channels/roles. No deletes.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n);\n\npermit (\n  principal,\n  action in [${WRITE_LIST}],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'discord:step-up-write',
    integrationId: 'discord',
    name: 'Step-up for writes',
    description: 'Reads always; every channel/role/message mutation requires a co-signer approval.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n);\n\npermit (\n  principal,\n  action in [${WRITE_LIST}, ${DELETE_LIST}],\n  resource\n)\nwhen { context.cosigner == true };`,
    visualReady: true,
  },
  {
    id: 'discord:moderation-only',
    integrationId: 'discord',
    name: 'Moderation only',
    description: 'Limited to role assignment, message + role deletes. Useful for moderator bots.',
    cedarText: `permit (\n  principal,\n  action in [Action::"/discord/member/add_role", Action::"/discord/member/remove_role", Action::"/discord/message/delete", Action::"/discord/role/delete", Action::"/discord/message/list", Action::"/discord/guild/members"],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'discord:time-bounded',
    integrationId: 'discord',
    name: 'Time-bounded access',
    description: 'Allow any action only during business hours (09:00–17:00 UTC).',
    cedarText:
      'permit (\n  principal,\n  action,\n  resource\n)\nwhen { context.time.hour >= 9 && context.time.hour < 17 };',
    visualReady: true,
  },
];
