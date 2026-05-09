import type { PolicyTemplate } from '../types.js';

export const READS = ['/google/drive/read', '/google/drive/list', '/google/calendar/read'] as const;
export const WRITES = [
  '/google/drive/write',
  '/google/calendar/event/create',
  '/google/calendar/event/update',
] as const;
export const actions = [...READS, ...WRITES] as const;

const READ_LIST = READS.map((a) => `Action::"${a}"`).join(', ');
const WRITE_LIST = WRITES.map((a) => `Action::"${a}"`).join(', ');

export const templates: PolicyTemplate[] = [
  {
    id: 'google:read-only',
    integrationId: 'google',
    name: 'Read-only',
    description: 'List + read Drive files and calendar events. No writes.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'google:read-and-write-own',
    integrationId: 'google',
    name: 'Read & write own',
    description: 'Read everything; write only resources owned by the calling user.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n);\n\npermit (\n  principal,\n  action in [${WRITE_LIST}],\n  resource\n)\nwhen { resource.owner_did == context.user.did };`,
    visualReady: false,
  },
  {
    id: 'google:time-bounded',
    integrationId: 'google',
    name: 'Time-bounded access',
    description: 'Allow any action only during business hours (09:00–17:00 UTC).',
    cedarText:
      'permit (\n  principal,\n  action,\n  resource\n)\nwhen { context.time.hour >= 9 && context.time.hour < 17 };',
    visualReady: true,
  },
  {
    id: 'google:step-up-write',
    integrationId: 'google',
    name: 'Step-up for writes',
    description: 'Reads always; Drive writes and calendar mutations require co-signer approval.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n);\n\npermit (\n  principal,\n  action in [${WRITE_LIST}],\n  resource\n)\nwhen { context.cosigner == true };`,
    visualReady: true,
  },
  {
    id: 'google:read-public-write-private',
    integrationId: 'google',
    name: 'Read public, write private',
    description: 'Read shared (public) docs and calendars; write only in private spaces.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n)\nwhen { resource.visibility == "public" };\n\npermit (\n  principal,\n  action in [${WRITE_LIST}],\n  resource\n)\nwhen { resource.visibility == "private" };`,
    visualReady: true,
  },
];
