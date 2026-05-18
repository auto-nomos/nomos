# Troubleshooting

This page is organized by **symptom**, not by cause. Start with the error
text or HTTP status the operator sees, then follow the diagnostic flow.

## Quick reference

| Symptom | Where to look |
|---|---|
| Dashboard "Verify now" fails | [Verification failures](#verification-failures) |
| `AADSTS70021` | [AADSTS70021 — No matching federated identity record](#aadsts70021) |
| `AADSTS700213` | [AADSTS700213 — App not configured for issuer](#aadsts700213) |
| `AADSTS700016` | [AADSTS700016 — Application not found](#aadsts700016) |
| `cosigner_required` on a read | [Read mistakenly flagged destructive](#read-mistakenly-flagged-destructive) |
| `schema_violation` | [Schema violations](#schema-violations) |
| `cloud_connection_not_verified` | [Connection not verified](#connection-not-verified) |
| `RequestDisallowedByAzure` | [Azure subscription policy blockers](#azure-subscription-policy-blockers) |
| `ResourceGroupNotFound` | [ARM 4xx vs broker errors](#arm-4xx-vs-broker-errors) |
| `cloud_call_failed` w/ `provider_status=502` | [PDP cloud adapter casing](#pdp-cloud-adapter-casing) |
| `pdp_invalid_response` | [SDK masking errors](#sdk-masking-errors) |
| MCP tool returns generic 500 | [MCP debug logging](#mcp-debug-logging) |

---

## Verification failures

The "Verify now" button calls `cloudConnections.verifyNow`. The most
common reasons it fails:

1. **The verify-poll FIC isn't registered.** Re-apply Terraform to ensure
   the `verify-poll` entry is in `additional_agent_ids`'s implicit set
   (the module always includes it).
2. **The role assignment hasn't propagated.** Azure RBAC propagation can
   take 30s–5min. Re-click verify after a minute.
3. **The subscription id in the dashboard doesn't match the role
   assignment's scope.** Check `terraform output role_scope`.

### AADSTS70021

```
AADSTS70021: No matching federated identity record found for presented
assertion subject 'customer/<C>/agent/<A>'.
```

The agent's FIC is missing. Either the agent uuid is wrong or you never
ran `terraform apply -var='additional_agent_ids=["<agent-uuid>"]'`.

Fix:

```bash
# Confirm the FICs registered on the App Reg.
az ad app federated-credential list --id <app-object-id> \
  --query '[].{name:name, subject:subject}' -o table

# If the agent subject isn't there:
terraform apply -var='additional_agent_ids=["<agent-uuid>"]'
```

> **Cap:** 20 FICs per App Reg. If you hit it, create a second App Reg
> + cloud connection and split agents between them.

### AADSTS700213

```
AADSTS700213: No matching federated identity record found for issuer.
```

The App Reg's trust isn't pointed at `https://id.auto-nomos.com`. Verify:

```bash
az ad app federated-credential list --id <app-object-id> \
  --query '[].{name:name, issuer:issuer}' -o table
```

Every row should show `issuer = https://id.auto-nomos.com`. If any
show something else, the App Reg was rotated outside Terraform; rerun
`terraform apply` to repair.

### AADSTS700016

```
AADSTS700016: Application with identifier '<app-client-id>' was not
found in the directory '<tenant-id>'.
```

Tenant or client id mismatch. Re-check the four values in
`/app/cloud/<connection-id>`. If you have multiple Entra tenants, the
App Reg is in a different one than expected.

---

## Connection not verified

`/v1/mint-ucan` returns `412 cloud_connection_not_verified`.

Cause: the cloud connection exists but `bootstrap_status != 'verified'`.

Fix: open `/app/cloud/<connection-id>` → "Verify now". If it fails,
follow [Verification failures](#verification-failures).

If verify keeps succeeding but the next mint still says not verified —
check the connection id you're passing. Dashboard URL has the right id;
copying from a stale tab is a common foot-gun.

---

## Schema violations

```
"error_code": "schema_violation",
"decision": { "reason": "apiCall.body required for /azure/nsgs/add_rule but missing" }
```

The PDP rejected the request *before Cedar* because the
`apiCall` shape doesn't match the action's schema in
`packages/schema-packs/src/azure/schemas.ts`.

Common causes:

| Action | Common slip |
|---|---|
| `/azure/nsgs/add_rule` | Missing `body.properties.access` (must be `Allow` or `Deny`) |
| `/azure/rbac/create_role_assignment` | Missing `body.properties.roleDefinitionId` or `principalId` |
| `/azure/cosmos/query` | Missing `body.query` |
| `/azure/log_analytics/kql` | Missing `body.query` |
| Any PATCH | Sent as POST or PUT |
| Any DELETE | Sent as POST |

Resolve by reading the schema in
`packages/schema-packs/src/azure/schemas.ts#customSchemas` for the
command you're calling.

---

## Read mistakenly flagged destructive

If a `list` or `get` command returns `cosigner_required`:

1. Confirm the verb is actually a read.
   ```ts
   import { commandIsDestructive } from '@auto-nomos/pdp/cloud-risk-rules';
   commandIsDestructive('/azure/vm/list');  // should be false
   ```
2. If the command is correctly classified, check the *policy*. Cedar
   policies can require step-up explicitly (see use case 2 in
   [use-cases.md](./use-cases.md)).

---

## Azure subscription policy blockers

```
"upstream": {
  "status": 403,
  "body": { "error": { "code": "RequestDisallowedByAzure", "message": "…" } }
}
```

Common on **free-tier / pay-as-you-go subscriptions**. Microsoft enrolls
new subs into an allowed-regions policy that restricts where regional
resources (VM, NSG, storage, …) can be deployed. Resource groups
themselves are exempt because they're global.

You'll see this most often during Phase B mutation tests — RG creation
works, but NSG/VM/storage creation inside the RG fails.

Workarounds:

1. **Use a paid subscription** — the policy is auto-removed on
   pay-as-you-go upgrade.
2. **Switch test to RG-tag mutations** — `scripts/prod-azure-mutate.mts`
   was rewritten for this reason.
3. **Contact Azure support** — the policy doc explicitly invites this
   for legitimate workloads.

---

## ARM 4xx vs broker errors

The PDP forwards ARM responses verbatim under `upstream.body`. To tell
"broker problem" from "Azure problem":

```jsonc
// Broker problem (Cedar deny, schema violation, missing FIC) — the
// outer `allow` is false and there is no `upstream`:
{
  "allow": false,
  "error_code": "policy_deny",
  "decision": { "reason": "no matching policy" }
}

// Azure problem — `allow` is true but ARM returned 4xx:
{
  "allow": true,
  "upstream": { "status": 403, "body": { "error": { "code": "AuthorizationFailed", … } } }
}
```

`AuthorizationFailed` means the App Registration's role assignment
doesn't grant the requested ARM action. Either widen the role or narrow
the agent's commands.

`ResourceNotFound` / `ResourceGroupNotFound` means the broker reached
ARM but the resource doesn't exist. Check the path you passed.

---

## PDP cloud adapter casing

If `cloud_call_failed` comes back with empty `providerBody`:

```jsonc
{
  "allow": true,
  "error_code": "cloud_call_failed",
  "providerStatus": 502,
  "providerBody": null
}
```

This was a real bug, fixed in `apps/pdp/src/adapters/cloud.ts`. The PDP
now accepts both `camelCase` and `snake_case` in upstream failure
payloads (`providerStatus`/`provider_status`,
`providerBody`/`provider_body`). If you see this on a recent build,
file an issue with the request `receiptId`.

---

## SDK masking errors

The TypeScript SDK throws `pdp_invalid_response` when the PDP response
doesn't carry a `receiptId`. This is intentional: every PDP decision
must produce a receipt for audit. If you see this:

1. Check that the PDP version is at least `0.4.0` (the sha256Hex on
   every deny branch landed in May 2026).
2. Check the response body in the PDP log for what was actually returned.

---

## MCP debug logging

The MCP server runs with `--log-level info` by default. Crank up:

```jsonc
{
  "mcpServers": {
    "nomos": {
      "args": ["-y", "@auto-nomos/mcp-server@0.0.19", "serve", "--log-level", "debug"]
    }
  }
}
```

Logs land in:

| Client | Log path |
|---|---|
| Cursor | `~/Library/Logs/Cursor/MCP/nomos.log` (macOS) |
| Claude Desktop | `~/Library/Logs/Claude/mcp-server-nomos.log` |
| Claude Code | stderr of the current session |

A 500 from a tool typically means the SDK threw — debug logs show the
full HTTP response from PDP / control plane.

---

## Common operator-side cleanups

### Stale UCANs

The dashboard `/app/ucans` shows minted UCANs. Pre-`exp` UCANs that
the agent abandoned aren't a security issue (replay nonce table
prevents reuse) but clutter audit. They auto-expire.

### Orphaned FICs

If you destroy an agent in the dashboard but forget to remove its FIC,
Terraform `apply` won't notice. Manually:

```bash
az ad app federated-credential delete \
  --id <app-object-id> \
  --federated-credential-id <fic-id>
```

Or remove the agent uuid from `additional_agent_ids` and re-apply.

### Stuck step-up requests

If an operator approves and the agent doesn't retry, the step-up row
stays in `state = approved` forever — no harm, but visible in
`/app/approvals`. Sweep manually:

```sql
UPDATE push_approvals
SET state = 'expired'
WHERE state = 'approved'
  AND created_at < now() - interval '1 hour'
  AND consumed_at IS NULL;
```

---

## Where to get help

| Channel | Best for |
|---|---|
| `/app/support` | Anything customer-specific (logs, receipts, billing) |
| GitHub issues at `auto-nomos/nomos` | Public-repo bugs, feature requests, broken docs |
| `https://docs.auto-nomos.com` | Always-on docs (this repo + redirects) |
| Slack `#nomos` (Acadia internal) | Eng triage |
