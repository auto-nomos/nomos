/**
 * Role × Resource × Action permission matrix.
 *
 * Single source of truth for "can role R perform action A on resource X?"
 * across tRPC routers, REST middlewares, and the dashboard UI.
 *
 * Roles map onto the `membership_role` Postgres enum. Resources are abstract
 * categories of objects (agents, policies, audit, members…) — finer-grained
 * row-level scoping happens at the query layer (customerId filter) and is
 * orthogonal to this matrix.
 */

export const ROLES = [
  'owner',
  'admin',
  'agent_manager',
  'policy_author',
  'auditor',
  'member',
] as const;
export type Role = (typeof ROLES)[number];

export const RESOURCES = [
  'org',
  'members',
  'invites',
  'agents',
  'grants',
  'swarms',
  'mcp_servers',
  'policies',
  'schemas',
  'envelopes',
  'api_keys',
  'audit',
  'billing',
  'oauth',
  'cloud_connections',
] as const;
export type Resource = (typeof RESOURCES)[number];

export const ACTIONS = ['read', 'create', 'update', 'delete'] as const;
export type Action = (typeof ACTIONS)[number];

type Bundle = Partial<Record<Resource, ReadonlyArray<Action>>>;

const ALL: ReadonlyArray<Action> = ACTIONS;
const READ: ReadonlyArray<Action> = ['read'];
const READ_WRITE: ReadonlyArray<Action> = ['read', 'create', 'update'];

function everyResource(actions: ReadonlyArray<Action>): Bundle {
  return Object.fromEntries(RESOURCES.map((r) => [r, actions])) as Bundle;
}

const OWNER_BUNDLE: Bundle = everyResource(ALL);

// admin = owner minus org:delete and minus billing mutations (billing:read OK).
const ADMIN_BUNDLE: Bundle = {
  ...everyResource(ALL),
  org: READ_WRITE,
  billing: READ,
};

const AGENT_MANAGER_BUNDLE: Bundle = {
  agents: ALL,
  grants: ALL,
  swarms: ALL,
  mcp_servers: ALL,
  api_keys: READ,
  oauth: READ_WRITE,
  cloud_connections: READ,
  policies: READ,
  schemas: READ,
  envelopes: READ,
  audit: READ,
  org: READ,
  members: READ,
  invites: READ,
};

const POLICY_AUTHOR_BUNDLE: Bundle = {
  policies: ALL,
  schemas: ALL,
  envelopes: ALL,
  agents: READ,
  grants: READ,
  swarms: READ,
  mcp_servers: READ,
  audit: READ,
  org: READ,
  members: READ,
  invites: READ,
};

const AUDITOR_BUNDLE: Bundle = {
  audit: READ,
  agents: READ,
  policies: READ,
  schemas: READ,
  grants: READ,
  swarms: READ,
  mcp_servers: READ,
  envelopes: READ,
  api_keys: READ,
  oauth: READ,
  cloud_connections: READ,
  org: READ,
  members: READ,
  invites: READ,
};

// Minimum-viable member: can read their own org metadata + see members list,
// but cannot mutate anything. Row-level filtering still applies on the DB
// query side (e.g. only see grants they are the subject of).
const MEMBER_BUNDLE: Bundle = {
  org: READ,
  members: READ,
};

const MATRIX: Record<Role, Bundle> = {
  owner: OWNER_BUNDLE,
  admin: ADMIN_BUNDLE,
  agent_manager: AGENT_MANAGER_BUNDLE,
  policy_author: POLICY_AUTHOR_BUNDLE,
  auditor: AUDITOR_BUNDLE,
  member: MEMBER_BUNDLE,
};

/**
 * True iff the given role is allowed to perform `action` on `resource`.
 * Used by tRPC withPermission middleware and dashboard mutation gating.
 */
export function hasPermission(role: Role, resource: Resource, action: Action): boolean {
  return MATRIX[role][resource]?.includes(action) ?? false;
}

/** Frozen bundle of permissions for a role. Useful for shipping to clients. */
export function expandRolePermissions(role: Role): Readonly<Bundle> {
  return MATRIX[role];
}

/** Convenience: list of permission pairs for a role, e.g. ['agents:create', …]. */
export function rolePermissionPairs(role: Role): ReadonlyArray<`${Resource}:${Action}`> {
  const out: Array<`${Resource}:${Action}`> = [];
  const bundle = MATRIX[role];
  for (const resource of RESOURCES) {
    for (const action of bundle[resource] ?? []) {
      out.push(`${resource}:${action}` as const);
    }
  }
  return out;
}
