import type { PolicyTemplate } from '../types.js';

export const SSH_READ_ACTIONS = ['/ssh/file/read', '/ssh/dir/list', '/ssh/dir/tree'] as const;

export const SSH_WRITE_ACTIONS = [
  '/ssh/file/write',
  '/ssh/file/create',
  '/ssh/file/move',
  '/ssh/file/copy',
  '/ssh/dir/create',
] as const;

export const SSH_DELETE_ACTIONS = [
  '/ssh/file/delete',
  '/ssh/dir/delete',
  '/ssh/dir/delete_recursive',
] as const;

export const actions = [
  ...SSH_READ_ACTIONS,
  ...SSH_WRITE_ACTIONS,
  ...SSH_DELETE_ACTIONS,
  '/ssh/exec',
] as const;

const ALL_READ = SSH_READ_ACTIONS.map((a) => `Action::"${a}"`).join(', ');
const ALL_WRITE = SSH_WRITE_ACTIONS.map((a) => `Action::"${a}"`).join(', ');
const ALL_DELETE = SSH_DELETE_ACTIONS.map((a) => `Action::"${a}"`).join(', ');
const ALL_NON_EXEC = [...SSH_READ_ACTIONS, ...SSH_WRITE_ACTIONS, ...SSH_DELETE_ACTIONS]
  .map((a) => `Action::"${a}"`)
  .join(', ');

export const templates: PolicyTemplate[] = [
  {
    id: 'ssh:host-pinned-read',
    integrationId: 'ssh',
    name: 'Host-pinned read',
    description:
      'Allow reads and directory listing on a single pinned host. Host is validated by the UCAN constraint.',
    cedarText: `permit (\n  principal,\n  action in [${ALL_READ}],\n  resource\n)\nwhen { context.resource_constraint has "host" };`,
    visualReady: true,
  },
  {
    id: 'ssh:sftp-upload',
    integrationId: 'ssh',
    name: 'SFTP upload',
    description:
      'Allow write and create operations to a UCAN-scoped path on a specific host. No reads, no deletes.',
    cedarText: `permit (\n  principal,\n  action in [${ALL_WRITE}],\n  resource\n)\nwhen { context.resource_constraint has "host" && context.resource_constraint has "path_prefix" };`,
    visualReady: true,
  },
  {
    id: 'ssh:host-subdir-full',
    integrationId: 'ssh',
    name: 'Full CRUD on host + path prefix',
    description:
      'Allow all filesystem operations (no exec) within the UCAN-scoped host and path prefix.',
    cedarText: `permit (\n  principal,\n  action in [${ALL_NON_EXEC}],\n  resource\n)\nwhen { context.resource_constraint has "host" && context.resource_constraint has "path_prefix" };`,
    visualReady: true,
  },
  {
    id: 'ssh:exec-step-up',
    integrationId: 'ssh',
    name: 'Shell exec with step-up',
    description:
      'Shell exec always requires a passkey cosigner. SFTP reads and writes are unrestricted on the pinned host.',
    cedarText: `permit (\n  principal,\n  action in [${ALL_NON_EXEC}],\n  resource\n)\nwhen { context.resource_constraint has "host" };\n\n@stepup("required")\npermit (\n  principal,\n  action == Action::"/ssh/exec",\n  resource\n)\nwhen { context.cosigner == true && context.resource_constraint has "host" };`,
    visualReady: false,
  },
  {
    id: 'ssh:delete-step-up',
    integrationId: 'ssh',
    name: 'Delete with step-up',
    description:
      'Remote delete operations require a passkey cosigner. Reads and writes proceed normally.',
    cedarText: `permit (\n  principal,\n  action in [${ALL_READ}, ${ALL_WRITE}],\n  resource\n)\nwhen { context.resource_constraint has "host" };\n\n@stepup("required")\npermit (\n  principal,\n  action in [${ALL_DELETE}],\n  resource\n)\nwhen { context.cosigner == true };`,
    visualReady: true,
  },
  {
    id: 'ssh:read-write-no-exec',
    integrationId: 'ssh',
    name: 'SFTP read + write (exec blocked)',
    description:
      'Allow all SFTP read and write operations. Shell exec is explicitly forbidden — the forbid overrides any permit.',
    cedarText: `permit (\n  principal,\n  action in [${ALL_READ}, ${ALL_WRITE}],\n  resource\n)\nwhen { context.resource_constraint has "host" };\n\nforbid (\n  principal,\n  action == Action::"/ssh/exec",\n  resource\n);`,
    visualReady: true,
  },
];
