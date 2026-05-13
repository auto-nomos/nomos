import type { PolicyTemplate } from '../types.js';

export const READS = [
  '/notion/page/read',
  '/notion/database/query',
  '/notion/database/read',
  '/notion/block/read',
  '/notion/block/retrieve',
  '/notion/search',
  '/notion/user/list',
  '/notion/user/read',
  '/notion/user/me',
  '/notion/comment/list',
] as const;
export const WRITES = [
  '/notion/page/create',
  '/notion/page/update',
  '/notion/block/append',
  '/notion/block/update',
  '/notion/database/create',
  '/notion/database/update',
  '/notion/comment/create',
] as const;
export const DELETES = ['/notion/block/delete'] as const;
export const actions = [...READS, ...WRITES, ...DELETES] as const;

const READ_LIST = READS.map((a) => `Action::"${a}"`).join(', ');
const WRITE_LIST = WRITES.map((a) => `Action::"${a}"`).join(', ');

export const templates: PolicyTemplate[] = [
  {
    id: 'notion:read-only',
    integrationId: 'notion',
    name: 'Read-only',
    description: 'Read pages, query databases. No writes.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'notion:read-and-write-own',
    integrationId: 'notion',
    name: 'Read & write own',
    description: 'Read everything; write only pages owned by the calling user.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n);\n\npermit (\n  principal,\n  action in [${WRITE_LIST}],\n  resource\n)\nwhen { resource.owner_did == context.user.did };`,
    visualReady: false,
  },
  {
    id: 'notion:time-bounded',
    integrationId: 'notion',
    name: 'Time-bounded access',
    description: 'Allow any action only during business hours (09:00–17:00 UTC).',
    cedarText:
      'permit (\n  principal,\n  action,\n  resource\n)\nwhen { context.time.hour >= 9 && context.time.hour < 17 };',
    visualReady: true,
  },
  {
    id: 'notion:step-up-write',
    integrationId: 'notion',
    name: 'Step-up for writes',
    description: 'Reads always; page mutations require co-signer approval.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n);\n\npermit (\n  principal,\n  action in [${WRITE_LIST}],\n  resource\n)\nwhen { context.cosigner == true };`,
    visualReady: true,
  },
  {
    id: 'notion:read-public-write-private',
    integrationId: 'notion',
    name: 'Read public, write private',
    description: 'Read shared pages; write only in private workspaces.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n)\nwhen { resource.visibility == "public" };\n\npermit (\n  principal,\n  action in [${WRITE_LIST}],\n  resource\n)\nwhen { resource.visibility == "private" };`,
    visualReady: true,
  },
];
