# `@auto-nomos/rbac`

Role-based access control primitives shared by the Nomos control plane, dashboard,
and PDP. Single source of truth for the permission matrix.

> Marked `private: true` today — the package is shipped to npm only once the API
> stabilizes (target 0.1.0). Internal consumers import via `workspace:*`.

## Roles

Six roles, ordered most-to-least powerful:

| Role | Best for | What it can do |
|---|---|---|
| `owner` | Founders, primary admins | Everything, including org delete + billing. |
| `admin` | Eng leads | Everything except org delete + ownership transfer. |
| `agent_manager` | MCP operators, DevOps | CRUD on agents, grants, swarms, MCP servers. Read policies + audit. |
| `policy_author` | Security, compliance | CRUD on policies, schemas, envelopes. Read agents + audit. |
| `auditor` | SOC, support engineers | Read-only across audit, agents, policies, grants. |
| `member` | Default for new invites | See members + org name. Promote when ready. |

## API

```ts
import { ROLES, can, type Role, type Permission } from '@auto-nomos/rbac';

if (can('agent_manager', 'agents:create')) {
  /* … */
}
```

| Export | What |
|---|---|
| `ROLES` | Tuple of every role name (typed as `Role`). |
| `can(role, permission)` | Boolean check against the matrix. |
| `permissionsFor(role)` | Full set of permissions granted to a role. |
| `Role` | TypeScript union: `'owner' \| 'admin' \| … \| 'member'`. |
| `Permission` | TypeScript union of every permission string. |

## Permission naming

`<resource>:<action>` — `agents:create`, `policies:update`, `audit:read`,
`org:delete`. Wildcards aren't supported; explicit beats clever.

## How it's used

- **Dashboard route guards**: `if (!can(session.role, 'audit:read')) redirect(…)`.
- **tRPC middleware**: every mutation declares the permission it requires; middleware
  throws `FORBIDDEN` if `can()` is false.
- **API key issuance**: the issue form pulls valid roles from `ROLES`. Keys carry
  the role they were issued with — agents act as their role.
- **PDP**: validates UCAN `att` matches the API key's role envelope before minting.

## Permission matrix

The full matrix lives in `src/permissions.ts`. Snippet:

```ts
export const PERMISSIONS: Record<Permission, Role[]> = {
  'org:delete': ['owner'],
  'org:read': ['owner', 'admin', 'agent_manager', 'policy_author', 'auditor', 'member'],
  'agents:create': ['owner', 'admin', 'agent_manager'],
  'agents:read': ['owner', 'admin', 'agent_manager', 'policy_author', 'auditor'],
  'policies:update': ['owner', 'admin', 'policy_author'],
  'audit:read': ['owner', 'admin', 'agent_manager', 'policy_author', 'auditor'],
  'invites:create': ['owner', 'admin'],
  // …
};
```

When you add a new resource, add the permission key here. Drift between layers is
impossible because every layer imports this file.

## Adding a permission

1. Add the key to `PERMISSIONS` in `src/permissions.ts`.
2. Update the `Permission` union type (the test suite catches drift).
3. Use it in the route guard / middleware / API.
4. `pnpm -F @auto-nomos/rbac test`.

## Docs

Live docs: [docs.auto-nomos.com/operate/members-and-roles](https://app.auto-nomos.com/docs/operate/members-and-roles)
