import type { PolicyTemplate } from '../types.js';

export const FILE_READ_ACTIONS = [
  '/filesystem/file/read',
  '/filesystem/dir/list',
  '/filesystem/dir/tree',
] as const;

export const FILE_WRITE_ACTIONS = [
  '/filesystem/file/write',
  '/filesystem/file/create',
  '/filesystem/file/move',
  '/filesystem/file/copy',
  '/filesystem/dir/create',
] as const;

export const FILE_DELETE_ACTIONS = [
  '/filesystem/file/delete',
  '/filesystem/dir/delete',
  '/filesystem/dir/delete_recursive',
] as const;

export const actions = [
  ...FILE_READ_ACTIONS,
  ...FILE_WRITE_ACTIONS,
  ...FILE_DELETE_ACTIONS,
] as const;

const ALL_READ = FILE_READ_ACTIONS.map((a) => `Action::"${a}"`).join(', ');
const ALL_WRITE = FILE_WRITE_ACTIONS.map((a) => `Action::"${a}"`).join(', ');
const ALL_DELETE = FILE_DELETE_ACTIONS.map((a) => `Action::"${a}"`).join(', ');
const ALL_OPS = [...FILE_READ_ACTIONS, ...FILE_WRITE_ACTIONS, ...FILE_DELETE_ACTIONS]
  .map((a) => `Action::"${a}"`)
  .join(', ');

/**
 * Path narrowing is NOT done inside Cedar — Cedar's `like` operator only
 * accepts literal patterns, and our `path_prefix` is issuer-vouched on the
 * UCAN. The PDP enforces path narrowing in two places:
 *   1. Pre-Cedar constraint gate in packages/core/src/decide.ts
 *   2. Data-plane filesystem adapter in apps/pdp/src/adapters/filesystem.ts
 * Cedar's job here is the orthogonal axes: time, host pin, role, step-up.
 */
export const templates: PolicyTemplate[] = [
  {
    id: 'filesystem:read-only',
    integrationId: 'filesystem',
    name: 'Read-only',
    description:
      'Allow read and list operations. Path narrowing is enforced by the UCAN constraint set via /v1/intent.',
    cedarText: `permit (\n  principal,\n  action in [${ALL_READ}],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'filesystem:subdir-read',
    integrationId: 'filesystem',
    name: 'Subdirectory read',
    description:
      'Allow reads only. The UCAN constraint pins the allowed path prefix — use /v1/intent to issue a scoped UCAN.',
    cedarText: `permit (\n  principal,\n  action in [${ALL_READ}],\n  resource\n)\nwhen { context.resource_constraint has "path_prefix" };`,
    visualReady: true,
  },
  {
    id: 'filesystem:write-subdir',
    integrationId: 'filesystem',
    name: 'Write within subdirectory',
    description: 'Allow writes and creates within the UCAN-scoped path prefix. No deletes.',
    cedarText: `permit (\n  principal,\n  action in [${ALL_WRITE}],\n  resource\n)\nwhen { context.resource_constraint has "path_prefix" };`,
    visualReady: true,
  },
  {
    id: 'filesystem:business-hours-write',
    integrationId: 'filesystem',
    name: 'Write during business hours',
    description: 'Allow writes only between 09:00 and 18:00 UTC.',
    cedarText: `permit (\n  principal,\n  action in [${ALL_WRITE}],\n  resource\n)\nwhen { context.time.hour >= 9 && context.time.hour < 18 };`,
    visualReady: true,
  },
  {
    id: 'filesystem:delete-step-up',
    integrationId: 'filesystem',
    name: 'Delete with step-up',
    description:
      'Permit delete operations only after a passkey cosigner approves. Read and write are unrestricted.',
    cedarText: `permit (\n  principal,\n  action in [${ALL_READ}, ${ALL_WRITE}],\n  resource\n);\n\n@stepup("required")\npermit (\n  principal,\n  action in [${ALL_DELETE}],\n  resource\n)\nwhen { context.cosigner == true };`,
    visualReady: true,
  },
  {
    id: 'filesystem:extension-filter',
    integrationId: 'filesystem',
    name: 'Extension filter (code files only)',
    description:
      'Allow reads on source code extensions only (.py, .ts, .js, .go, .rs, .json, .yaml). Block binary and sensitive files.',
    cedarText: `permit (\n  principal,\n  action in [${ALL_READ}],\n  resource\n)\nwhen { [".py", ".ts", ".js", ".go", ".rs", ".json", ".yaml", ".toml", ".md"].contains(resource.extension) };`,
    visualReady: false,
  },
  {
    id: 'filesystem:developer-sandbox',
    integrationId: 'filesystem',
    name: 'Developer sandbox (full CRUD)',
    description:
      'Full read/write/delete within the UCAN-scoped path prefix. Intended for a sandboxed temp or project directory.',
    cedarText: `permit (\n  principal,\n  action in [${ALL_OPS}],\n  resource\n)\nwhen { context.resource_constraint has "path_prefix" };`,
    visualReady: true,
  },
  {
    id: 'filesystem:host-pinned-read',
    integrationId: 'filesystem',
    name: 'Host-pinned read',
    description:
      'Allow reads only when the UCAN constraint pins a specific host. Confines the agent to one machine.',
    cedarText: `permit (\n  principal,\n  action in [${ALL_READ}],\n  resource\n)\nwhen { context.resource_constraint has "host" };`,
    visualReady: true,
  },
];
