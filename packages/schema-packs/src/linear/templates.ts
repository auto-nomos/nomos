import type { PolicyTemplate } from '../types.js';

export const READS = [
  '/linear/issue/read',
  '/linear/issue/list',
  '/linear/project/read',
  '/linear/project/list',
  '/linear/team/list',
] as const;
export const WRITES = [
  '/linear/issue/create',
  '/linear/issue/comment',
  '/linear/issue/update',
  '/linear/issue/close',
] as const;
export const actions = [...READS, ...WRITES] as const;

const READ_LIST = READS.map((a) => `Action::"${a}"`).join(', ');
const WRITE_LIST = WRITES.map((a) => `Action::"${a}"`).join(', ');

export const templates: PolicyTemplate[] = [
  {
    id: 'linear:read-only',
    integrationId: 'linear',
    name: 'Read-only',
    description: 'List + read issues, projects, teams. No mutations.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'linear:triage',
    integrationId: 'linear',
    name: 'Triage helper',
    description: 'Read everything; comment + update issue state, no creation.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}, Action::"/linear/issue/comment", Action::"/linear/issue/update"],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'linear:create-only',
    integrationId: 'linear',
    name: 'Create-only',
    description: 'Reads + create new issues. Cannot update or close existing.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}, Action::"/linear/issue/create", Action::"/linear/issue/comment"],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'linear:step-up-close',
    integrationId: 'linear',
    name: 'Step-up to close',
    description: 'Read + create + comment freely; closing an issue requires co-signer.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}, Action::"/linear/issue/create", Action::"/linear/issue/comment", Action::"/linear/issue/update"],\n  resource\n);\n\npermit (\n  principal,\n  action == Action::"/linear/issue/close",\n  resource\n)\nwhen { context.cosigner == true };`,
    visualReady: true,
  },
  {
    id: 'linear:full-write',
    integrationId: 'linear',
    name: 'Full write',
    description: 'All read + write actions. Use sparingly.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}, ${WRITE_LIST}],\n  resource\n);`,
    visualReady: true,
  },
];
