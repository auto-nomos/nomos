import type { PolicyTemplate } from '../types.js';

export const READS = [
  '/github/user/read',
  '/github/repo/read',
  '/github/repo/list',
  '/github/issue/read',
  '/github/issue/list',
  '/github/pr/read',
  '/github/pr/list',
  '/github/branch/list',
  '/github/content/read',
  '/github/commit/list',
  '/github/issue/search',
  '/github/repo/search',
  '/github/label/list',
  '/github/issue/comment/list',
  '/github/workflow/run/list',
  '/github/pr/review/list',
] as const;
export const WRITES = [
  '/github/repo/create',
  '/github/issue/create',
  '/github/issue/comment',
  '/github/issue/close',
  '/github/pr/create',
  '/github/pr/merge',
  '/github/content/update',
  '/github/issue/label',
  '/github/release/create',
  '/github/workflow/trigger',
  '/github/pr/review/submit',
] as const;
export const DELETES = ['/github/repo/delete'] as const;

export const actions = [...READS, ...WRITES, ...DELETES] as const;

const READ_LIST = READS.map((a) => `Action::"${a}"`).join(', ');
const WRITE_LIST = WRITES.map((a) => `Action::"${a}"`).join(', ');
const DELETE_LIST = DELETES.map((a) => `Action::"${a}"`).join(', ');

export const templates: PolicyTemplate[] = [
  {
    id: 'github:safe-default',
    integrationId: 'github',
    name: 'Safe default',
    description:
      'Reads always; writes require a co-signer approval; destructive deletes always forbid.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n);\n\npermit (\n  principal,\n  action in [${WRITE_LIST}],\n  resource\n)\nwhen { context.cosigner == true };\n\nforbid (\n  principal,\n  action in [${DELETE_LIST}],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'github:read-only',
    integrationId: 'github',
    name: 'Read-only',
    description: 'Allows reading repos, issues, and PRs. No writes.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'github:read-and-write-own',
    integrationId: 'github',
    name: 'Read & write own',
    description: 'Read everything; write only resources owned by the calling user.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n);\n\npermit (\n  principal,\n  action in [${WRITE_LIST}],\n  resource\n)\nwhen { resource.owner_did == context.user.did };`,
    visualReady: false,
  },
  {
    id: 'github:time-bounded',
    integrationId: 'github',
    name: 'Time-bounded access',
    description: 'Allow any action only during business hours (09:00–17:00 UTC).',
    cedarText:
      'permit (\n  principal,\n  action,\n  resource\n)\nwhen { context.time.hour >= 9 && context.time.hour < 17 };',
    visualReady: true,
  },
  {
    id: 'github:step-up-write',
    integrationId: 'github',
    name: 'Step-up for writes',
    description: 'Reads always; writes only when a co-signer has approved.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n);\n\npermit (\n  principal,\n  action in [${WRITE_LIST}],\n  resource\n)\nwhen { context.cosigner == true };`,
    visualReady: true,
  },
  {
    id: 'github:read-public-write-private',
    integrationId: 'github',
    name: 'Read public, write private',
    description: 'Read public resources; write only inside private repos.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n)\nwhen { resource.visibility == "public" };\n\npermit (\n  principal,\n  action in [${WRITE_LIST}],\n  resource\n)\nwhen { resource.visibility == "private" };`,
    visualReady: true,
  },
];
