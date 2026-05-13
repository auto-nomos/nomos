import type { PolicyTemplate } from '../types.js';

export const READS = [
  '/google/tasks/tasklist/list',
  '/google/tasks/task/list',
  '/google/tasks/task/read',
] as const;
export const WRITES = [
  '/google/tasks/task/create',
  '/google/tasks/task/update',
] as const;
export const DELETES = ['/google/tasks/task/delete'] as const;
export const actions = [...READS, ...WRITES, ...DELETES] as const;

const READ_LIST = READS.map((a) => `Action::"${a}"`).join(', ');
const WRITE_LIST = WRITES.map((a) => `Action::"${a}"`).join(', ');
const DELETE_LIST = DELETES.map((a) => `Action::"${a}"`).join(', ');

export const templates: PolicyTemplate[] = [
  {
    id: 'google_tasks:read-only',
    integrationId: 'google_tasks',
    name: 'Read-only',
    description: 'List tasklists and read tasks. No writes.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'google_tasks:create-only',
    integrationId: 'google_tasks',
    name: 'Create-only',
    description: 'Read + create tasks. Cannot update or delete existing.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}, Action::"/google/tasks/task/create"],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'google_tasks:read-and-create',
    integrationId: 'google_tasks',
    name: 'Read + create',
    description: 'Same as create-only with an explicit name for the wizard.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}, Action::"/google/tasks/task/create"],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'google_tasks:step-up-delete',
    integrationId: 'google_tasks',
    name: 'Step-up to delete',
    description: 'Read + create + update freely; deleting a task requires co-signer.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}, ${WRITE_LIST}],\n  resource\n);\n\npermit (\n  principal,\n  action in [${DELETE_LIST}],\n  resource\n)\nwhen { context.cosigner == true };`,
    visualReady: true,
  },
  {
    id: 'google_tasks:full-write',
    integrationId: 'google_tasks',
    name: 'Full write',
    description: 'All read + write + delete actions. Use sparingly.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}, ${WRITE_LIST}, ${DELETE_LIST}],\n  resource\n);`,
    visualReady: true,
  },
];
