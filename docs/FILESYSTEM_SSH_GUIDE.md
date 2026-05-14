# Filesystem + SSH Access Control — User Guide

Nomos brokers agent access to **local filesystems** and **remote hosts over SSH/SFTP** with the same Cedar-policy, UCAN-scoped, step-up-gated machinery used for GitHub, Slack, Stripe, etc. This guide covers connect → policy → use → observe.

> Status: GA. Shipped 2026-05-14. Adapters `filesystem` v1.0.0, `ssh` v1.0.0.

---

## TL;DR

```
agent ──► MCP tool (e.g. nomos_filesystem_read_file)
        │
        ▼
     PDP /v1/proxy/:command
        │  ┌─ schema-pack apiCall + resource validation
        │  ├─ Cedar policy evaluation (step-up if @stepup)
        │  └─ resource_constraint enforcement (path_prefix, host)
        ▼
   adapter dispatch
        │
        ├─ /filesystem/* → node:fs/promises (PDP process, root-aware)
        └─ /ssh/*        → node-ssh SFTP+exec (env-supplied private key)
```

The agent **never** sees the SSH key. It never touches a real path it isn't policy-scoped to. Every call writes a hash-chained audit row.

---

## 1. The two adapters

| Adapter | Auth | Transport | Where execution happens |
|---|---|---|---|
| `filesystem` | none (PDP host) | Node `fs` | the PDP process |
| `ssh` | `SSH_PRIVATE_KEY` env | `node-ssh` (SFTP + exec) | remote host you reach over SSH |

Both share the same 11 file/dir operations. `ssh` adds `/ssh/exec` (always step-up).

| Command | filesystem | ssh | Risk |
|---|---|---|---|
| `file/read` | ✓ | ✓ | read/low |
| `file/write` | ✓ | ✓ | write/high |
| `file/create` | ✓ | ✓ | write/medium |
| `file/delete` | ✓ | ✓ | delete/high |
| `file/move` | ✓ | ✓ | write/high |
| `file/copy` | ✓ | ✓ | write/medium |
| `dir/list` | ✓ | ✓ | read/low |
| `dir/tree` | ✓ | ✓ | read/medium |
| `dir/create` | ✓ | ✓ | write/low |
| `dir/delete` | ✓ | ✓ | delete/high |
| `dir/delete_recursive` | ✓ | ✓ | delete/critical |
| `exec` | — | ✓ | write/critical (step-up forced) |

---

## 2. Connecting an agent

You **do not** OAuth-connect filesystem or SSH. There is no SaaS to redirect to. Connection is two things:

### 2.1 Configure the PDP host (filesystem)

The PDP process needs read/write permission on whatever paths agents will reach. Typical patterns:

- Run PDP as a dedicated low-privilege user that owns a sandbox dir (e.g. `/var/nomos/sandbox/{customer_id}/`).
- Mount a project volume read-only when only reads are needed.
- Use a `chroot`-style mount or a container with bind-mounted dirs in production.

### 2.2 Configure SSH credentials (ssh)

Provide these env vars to the PDP process:

```sh
SSH_PRIVATE_KEY=$(base64 -w0 < ~/.ssh/agent-bot)         # required, PEM or Base64
SSH_PASSPHRASE='...optional...'
SSH_KNOWN_HOSTS='...optional, OpenSSH known_hosts...'
```

`SSH_PRIVATE_KEY` accepts either raw PEM (`-----BEGIN ...`) or a Base64-encoded PEM. The dispatcher auto-detects.

The same key is used for every `/ssh/*` call. Constrain blast radius at the UCAN layer (`host`, `path_prefix`) and the policy layer (Cedar templates).

### 2.3 Register integrations on the agent

In the dashboard or via CLI, the agent's allowed integrations now include `filesystem` and `ssh`:

```ts
// SDK
const agent = await sdk.agents.create({
  name: 'ops-bot',
  integrations: ['filesystem', 'ssh', 'github'],
});
```

In Cursor / Claude Desktop, the MCP server picks up both providers automatically once `CB_INTEGRATIONS` (or the control-plane list) includes them.

---

## 3. Scoping with UCAN constraints

Every request from an agent carries a UCAN. The UCAN's `meta.resource_constraint` pins what the bearer may touch. The PDP enforces this at three layers:

1. **Cedar policy** — declarative `permit/forbid` against the command.
2. **Resource consistency** — declared `request.resource` must match `apiCall.path`.
3. **Adapter enforcement** — final disk/SFTP call rejects out-of-prefix paths and `..` / symlink escapes.

### 3.1 Filesystem constraint shape

```json
{
  "provider": "filesystem",
  "path_prefix": "/var/nomos/sandbox/customer_abc",
  "host": "pdp-prod-1"          // optional; pin to a single PDP host
}
```

### 3.2 SSH constraint shape

```json
{
  "provider": "ssh",
  "host": "build-server-3.example.com",       // required
  "port": 22,                                   // optional, default 22
  "username": "deploy",                         // optional but recommended
  "path_prefix": "/srv/builds"                  // optional; whole-host without it
}
```

### 3.3 Defenses already wired

| Attack | Defense |
|---|---|
| `..` traversal | `path.resolve()` collapse before prefix check |
| Symlink escape | `fs.realpath()` on both ends |
| Sibling-string match (`/foo` vs `/foobar`) | strict `prefix + '/'` boundary |
| Shell metachar in remote path (`$(...)`, backticks) | reject pre-dispatch, single-quote when shelling |
| Connect-hang DoS | 10 s connect timeout, 30 s op timeout |
| Exec stdout flood | 1 MB cap per stream, truncated flag in response |
| Deleting the constraint root | explicit equal-path guard before `rm -rf` |

---

## 4. Policy templates

Visual builder, REST, or hand-edited Cedar — all three accept the templates that ship in `@auto-nomos/schema-packs/filesystem` and `@auto-nomos/schema-packs/ssh`.

### filesystem (8 templates)

| id | Use when |
|---|---|
| `filesystem:read-only` | Researcher pulls source/config; no writes |
| `filesystem:subdir-read` | Reads pinned to one project dir |
| `filesystem:write-subdir` | Codegen agent writes under `/project/output` |
| `filesystem:business-hours-write` | Auto-writes only 09:00–18:00 UTC |
| `filesystem:delete-step-up` | Deletes require passkey approval |
| `filesystem:extension-filter` | Only `.py/.ts/.json/...` allowed |
| `filesystem:developer-sandbox` | Full CRUD in `/tmp/agent-sandbox` |
| `filesystem:host-pinned-read` | Read confined to one machine |

### ssh (6 templates)

| id | Use when |
|---|---|
| `ssh:host-pinned-read` | Logs/config read on one server |
| `ssh:sftp-upload` | One-way file deploy to a path |
| `ssh:host-subdir-full` | Build agent owns one dir on one server |
| `ssh:exec-step-up` | Shell exec always requires passkey |
| `ssh:delete-step-up` | Remote deletes require passkey |
| `ssh:read-write-no-exec` | SFTP-only — exec explicitly forbidden |

### Step-up annotation

Any policy marked `@stepup("required")` triggers the existing two-pass Cedar detector. First pass denies; SDK fetches a passkey approval via the existing PWA; second pass arrives with `cosignerJwt`; PDP merges `context.cosigner=true` and re-evaluates. No code-path changes — the new templates plug into the existing flow.

---

## 5. Use cases

### 5.1 Researcher pulls local docs, can never write

```yaml
agent: research-bot
integrations: [filesystem]
policies:
  - template: filesystem:subdir-read
    constraint:
      provider: filesystem
      path_prefix: /docs/handbook
```

The agent can `nomos_filesystem_read_file` and `dir/list` inside `/docs/handbook`, nothing else.

### 5.2 Codegen agent writes only `.ts` into a project subdir

```yaml
policies:
  - template: filesystem:write-subdir
    constraint:
      provider: filesystem
      path_prefix: /workspace/api/src/generated
  - template: filesystem:extension-filter
    extensions: [.ts, .json]
```

Composing two permits: must satisfy both — write within prefix AND match extension.

### 5.3 Remote deploy bot — SFTP upload + restart

```yaml
agent: deployer
integrations: [ssh]
policies:
  - template: ssh:sftp-upload
    constraint:
      provider: ssh
      host: app-prod-1.example.com
      username: deploy
      path_prefix: /srv/app/releases
  - template: ssh:exec-step-up   # systemctl restart needs passkey
    constraint:
      provider: ssh
      host: app-prod-1.example.com
```

Routine deploys flow through SFTP without step-up. The restart command waits for a human passkey tap.

### 5.4 Recovery bot — read-only forensic on one host

```yaml
policies:
  - template: ssh:read-write-no-exec
    constraint:
      provider: ssh
      host: failed-server-7.example.com
      path_prefix: /var/log
```

Bot can pull logs over SFTP. Cannot exec, cannot escape `/var/log`.

### 5.5 Sandboxed code-execution agent

```yaml
policies:
  - template: filesystem:developer-sandbox
    constraint:
      provider: filesystem
      path_prefix: /tmp/agent-sandbox/{customer_id}
```

Full CRUD in a tempdir created per session by the control plane.

---

## 6. Calling from an agent (MCP)

Once the agent's `CB_INTEGRATIONS` includes `filesystem` and/or `ssh`, the MCP server exposes one tool per action:

```
nomos_filesystem_read_file
nomos_filesystem_write_file
nomos_filesystem_create_file
nomos_filesystem_delete_file
nomos_filesystem_move_file
nomos_filesystem_copy_file
nomos_filesystem_list_dir
nomos_filesystem_tree_dir
nomos_filesystem_create_dir
nomos_filesystem_delete_dir
nomos_filesystem_delete_dir_recursive

nomos_ssh_read_file
nomos_ssh_write_file
... (same 11, plus)
nomos_ssh_exec
```

Each tool's input schema is derived from the YAML. Example shape for `nomos_filesystem_write_file`:

```json
{
  "path": "/workspace/api/src/generated/types.ts",
  "content": "export type Foo = ...",
  "encoding": "utf-8"
}
```

The MCP tool returns the upstream JSON the PDP produced (e.g. `{ realPath, ... }` for filesystem, `{ stdout, stderr, code, truncated? }` for exec).

### 6.1 Direct SDK use

```ts
import { Sdk } from '@auto-nomos/sdk';

const sdk = new Sdk({ pdpUrl, apiKey });
const result = await sdk.proxy('/filesystem/file/read', {
  apiCall: { method: 'GET', path: '/file/read', query: { path: '/docs/handbook/api.md' } },
  resource: { provider: 'filesystem', path: '/docs/handbook/api.md' },
});
```

The SDK fail-closes on unreachable PDP, just like every other adapter.

---

## 7. Step-up flow (delete / exec)

1. Agent calls `nomos_filesystem_delete_dir_recursive`.
2. PDP runs Cedar; first pass denies because policy is `@stepup("required")` and `context.cosigner != true`.
3. PDP detects a second pass with `cosigner=true` would allow → creates a `push_approvals` row → returns `decision.requiresStepUp=true` + `stepUpUrl`.
4. SDK polls; user opens the PWA, signs with passkey, control plane mints a cosigner UCAN.
5. SDK replays the call with `cosignerJwt`.
6. PDP validates the cosigner, merges `context.cosigner=true`, re-evaluates, allows, dispatches.

Same flow as GitHub `delete_repo` — nothing new to learn.

---

## 8. Observability

### 8.1 Audit row (every call)

Each `/v1/proxy/:command` call produces an audit event with:

- `command` (e.g. `/filesystem/file/write`, `/ssh/exec`)
- `apiCall.{method,path}` (virtual path of the op)
- `resource_constraint` (host, path_prefix from UCAN)
- `decision.{allow,reason,receiptId}`
- `customer_id`, `agent_did`, hash-chain `prev_hash`/`hash`

Rows land in `audit_events` and are visible at:

```
Dashboard → Audit (/app/audit)
```

Filter by `command=/filesystem/*` or `command=/ssh/*` to scope.

### 8.2 Action graph (swarm view)

Each call also emits an `action_spans` row carrying:

- `toolName` — the Cedar command
- `requestSummary` — redacted apiCall args (path, host)
- `responseSummary` — redacted upstream result
- `latencyMs`, `status` (`allowed` / `denied` / `failed`)
- `parentSpanId`, `causation_id` — chain visualisation

These render unchanged in `Dashboard → Swarms → :id → Action Graph`. Filesystem/SSH spans appear in the timeline next to every other tool span — provider-agnostic UI.

### 8.3 Parity gate (historic audit sweep)

`scripts/audit-content-update-smuggle.mts` now sweeps `filesystem` and `ssh` audit rows for path-smuggle patterns (apiCall.path divergence from the expected template). Run after any deploy:

```sh
DATABASE_URL='postgres://...' pnpm tsx scripts/audit-content-update-smuggle.mts
```

### 8.4 Metrics

Existing PDP Prometheus counters (`pdp_authorize_total{decision,reason}`) tag filesystem/SSH calls the same way. No dashboard wiring needed.

---

## 9. Managing it day-to-day

| Task | Where |
|---|---|
| Add filesystem/ssh to an agent | Dashboard → Agents → Edit → toggle the integration |
| Author a new policy | Dashboard → Policies → New → integration = `filesystem` or `ssh` |
| Visual edit | Dashboard → Policy → Visual tab (uses policy-builder IR) |
| Revoke a UCAN mid-flight | Dashboard → Audit → row → "Revoke" (pushes to PDP cache, ≤1 s) |
| Rotate SSH key | Update `SSH_PRIVATE_KEY` env on the PDP host, restart PDP |
| Pin a UCAN to one host/path | Use `cb intent issue --constraint host=...,path_prefix=...` |
| Inspect step-up approvals | Dashboard → Approvals tab |

---

## 10. Limits and gotchas

- **One SSH key per PDP.** Multi-tenant key isolation is the next iteration — for now, isolate by VPC / PDP-per-tenant.
- **No known_hosts pinning yet.** `SSH_KNOWN_HOSTS` env exists in the schema but isn't wired into `node-ssh`. Operate on private networks until v1.1.
- **Filesystem ops run inside the PDP process.** Resource limits (ulimit, container memory) apply to the PDP. Don't let an agent read 50 GB files — add a size cap via Cedar context if needed.
- **Tree depth capped at 10** to prevent runaway recursion; configurable per request up to that ceiling.
- **`/ssh/exec` truncates at 1 MB per stream.** Returns `truncated: true` so the agent knows the output is incomplete.
- **`deleteDirRecursive` refuses to delete the prefix root itself.** Always leaves the sandbox dir.
- **No SCP — SFTP only.** Same security model, marginally different wire protocol. SCP is deprecated upstream anyway.

---

## 11. Quick verify checklist after deploy

```sh
# 1. Adapters load
pnpm -F @auto-nomos/adapters test

# 2. Schema-pack templates round-trip
pnpm -F @auto-nomos/schema-packs test

# 3. PDP enforcement (path traversal, symlink, prefix bug, shell quoting)
pnpm -F @auto-nomos/pdp test

# 4. Pack-smoke (publish-shape)
pnpm test:packs

# 5. Live smoke against deployed PDP+CP
DATABASE_URL=... pnpm test:smoke
```

---

## 12. Where to look in the code

| Concern | Path |
|---|---|
| Filesystem adapter | `apps/pdp/src/adapters/filesystem.ts` |
| SSH adapter | `apps/pdp/src/adapters/ssh.ts` |
| Filesystem dispatch | `apps/pdp/src/adapters/filesystem-dispatch.ts` |
| SSH dispatch | `apps/pdp/src/adapters/ssh-dispatch.ts` |
| Proxy wiring | `apps/pdp/src/routes/proxy.ts` (search `command.startsWith('/filesystem/')`) |
| YAML specs | `packages/adapters/spec/filesystem.yaml`, `…/ssh.yaml` |
| Cedar templates | `packages/schema-packs/src/filesystem/templates.ts`, `…/ssh/templates.ts` |
| MCP tools | `packages/mcp-server/src/tools/filesystem.ts`, `…/ssh.ts` |
| Shared types | `packages/shared-types/src/ucan.ts` (`FilesystemConstraint`, `SshConstraint`) |
| Auth schema | `packages/adapters/src/schema.ts` (`local`, `ssh_key` kinds) |
