# Organization-level RBAC

Nomos treats every `customers` row in the DB as an **organization**. Each
organization has one or more members (rows in `memberships`) and zero or more
API keys (rows in `api_keys`). Both carry a `role` from the
`membership_role` Postgres enum, and every privileged action in the platform
flows through a single source-of-truth permission matrix in
[`packages/rbac`](../packages/rbac).

## Roles

| Role            | Best for                                  | Notes                                                                                      |
| --------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| `owner`         | Founders, primary admins                  | Full control including org delete and billing.                                             |
| `admin`         | Engineering leads                         | Everything except `org:delete` and billing mutations.                                      |
| `agent_manager` | MCP-server operators / DevOps             | Full CRUD on agents, grants, swarms, MCP servers. Read-only on policies and audit.         |
| `policy_author` | Security / compliance engineers           | Full CRUD on policies, schemas, envelopes. Read-only on agents + audit.                    |
| `auditor`       | SOC, internal auditors, support engineers | Read-only across audit, agents, policies, grants. Cannot mint UCANs or change anything.    |
| `member`        | Default for newly-invited teammates       | See members + org name. Row-level filters elsewhere may grant access to their own grants.  |

Every existing user — pre-Org-RBAC — is automatically the `owner` of their
historical default organization (the customer row the signup hook created for
them). The migration `0029_org_rbac.sql` backfills any missing memberships.

## Permission matrix

The matrix in `packages/rbac/src/permissions.ts` is the single source of
truth. Three concepts:

- **Resources** — `org`, `members`, `invites`, `agents`, `grants`, `swarms`,
  `mcp_servers`, `policies`, `schemas`, `envelopes`, `api_keys`, `audit`,
  `billing`, `oauth`, `cloud_connections`.
- **Actions** — `read`, `create`, `update`, `delete`.
- **Bundles** — each role maps to a subset of `(resource, action)` pairs.

To check a permission anywhere in the code:

```ts
import { hasPermission } from '@auto-nomos/rbac';

if (!hasPermission(ctx.role, 'policies', 'update')) {
  throw new TRPCError({ code: 'FORBIDDEN' });
}
```

In practice, tRPC procedures should use the `withPermission` builder rather
than calling `hasPermission` directly:

```ts
export const exampleRouter = router({
  update: withPermission('policies', 'update')
    .input(...)
    .mutation(async ({ ctx, input }) => { ... }),
});
```

For non-tRPC routes mounted under the `apiKeyAuth` Hono middleware, use
`requirePermission`:

```ts
app.post(
  '/v1/mint-ucan',
  apiKeyAuth({ db: deps.db }),
  requirePermission('agents', 'update'),
  async (c) => { ... },
);
```

## Where roles attach

- **User sessions** — `memberships.role` is resolved per-request in
  `apps/control-plane/src/trpc/context.ts`. The active org is the one
  pointed to by the `x-cb-org` cookie (if the user has membership for that
  org); otherwise the first owner-role membership; otherwise the first
  membership of any role.
- **Machine traffic (API keys)** — `api_keys.role` is loaded in
  `apps/control-plane/src/middleware/api-key-auth.ts` and exposed on
  `c.var.role` + `c.var.permissions` for downstream Hono handlers.

API keys default to `admin` when not specified — both at the SQL level
(post-migration) and at the TS layer (`$defaultFn` in `apps/control-plane/
src/db/schema.ts`). Operators bringing a key down to least-privilege should
re-scope explicitly:

```sql
UPDATE api_keys SET role = 'agent_manager' WHERE id = '...';
```

## Org switcher cookie

The dashboard sets a `x-cb-org=<customerId>` cookie via `document.cookie`
(non-HttpOnly, `SameSite=Lax`) when the user picks an org from the
top-nav switcher. `context.ts` re-verifies membership on every request, so
forging the cookie to an unowned org silently falls back to the user's
default membership.

## Audit trail

Role changes flow through `members.changeRole`, which enforces last-owner
protection (cannot demote / remove the final owner). The mutation does not
write a separate audit row today — `auth.lifecycle` pino logs capture the
event in structured form (filter `event=auth.membership.change` in your log
sink).

## Adding a new resource

1. Add the resource string to `RESOURCES` in
   `packages/rbac/src/permissions.ts`.
2. Update each role's bundle in the same file with the relevant actions.
3. Add the unit test case in `packages/rbac/src/__tests__/permissions.test.ts`
   that covers at minimum one allow + one deny per role.
4. Gate the corresponding tRPC procedures with
   `withPermission('<resource>', '<action>')`.
5. (Optional) If a Hono route under `apiKeyAuth` needs the same gate, use
   `requirePermission('<resource>', '<action>')`.

## Future work (out of scope of v1)

- Per-user attribute-based access control (ABAC) for finer-grained scopes.
- Audit log table dedicated to role changes (today the chain only captures
  PDP receipts).
- Self-serve org delete from the dashboard danger zone.
