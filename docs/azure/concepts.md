# Concepts

This page defines the moving parts behind every Azure call Nomos brokers.
The goal is for an operator to be able to read a single audit row and
reconstruct exactly what was authorized, by whom, against what, and why.

## Identities

| Identity | Lives at | Held by |
|---|---|---|
| **User** | Better-Auth row in `users` | Operator (you) |
| **Organization** (customer) | `customers` table; uuid | Tenant boundary; every Drizzle query filters on `customer_id` |
| **Agent** | `agents` row; carries a `did:key:…` DID | One per autonomous worker |
| **Cloud Connection** | `cloud_connections` row | Tenant + Azure App Registration binding |
| **App Registration** (Azure) | Microsoft Entra ID | Trust target for federated identity |
| **Service Principal** (Azure) | Per-subscription instance of the App Reg | Recipient of role assignments |
| **Federated Identity Credential** (FIC) | Child of App Registration | Exact-match subject string; one per agent |

The federation contract: a UCAN minted for agent `A` in customer `C`
becomes an OIDC ID token whose `sub` claim is
`customer/<C>/agent/<A>`. Entra ID accepts the token only if a FIC with
that exact subject exists on the bound App Registration.

## The UCAN envelope

UCAN = User Controlled Authorization Network. The Nomos profile is
documented in [`docs/adr/0002-thin-ucan-jwt-envelope.md`](../adr/0002-thin-ucan-jwt-envelope.md).
The relevant fields for Azure:

```jsonc
{
  "iss": "did:key:z6Mk…issuer-key…",  // Nomos control plane signing key
  "aud": "did:key:z6Mk…agent-key…",    // Agent DID
  "cmd": "/azure/vm/list",             // Exactly one command per UCAN
  "sub": "customer/<C>/agent/<A>",     // Federation subject
  "pol": [],                           // Optional Cedar predicates
  "nonce": "<random>",                 // Replay protection
  "nbf": 1747500000,                   // Not-before
  "exp": 1747500600,                   // 10 min default TTL
  "meta": {
    "cloud_connection_id": "<uuid>",   // Which cloud_connections row to use
    "resource_constraint": {
      "provider": "azure",
      "subscription_id": "<sub>",
      "resource_group": "<rg>",        // Optional narrowing
      "resource_type": "<ARM-type>",   // Optional narrowing
      "name": "<resource-name>"        // Optional narrowing
    }
  }
}
```

A single UCAN authorizes a single command. Calling a second command
requires a second UCAN (or a multi-command mint that returns one per
command). This keeps the audit trail honest — one UCAN, one decision,
one receipt.

## The federation chain

When the PDP receives a `/v1/proxy/<command>` request:

```
1. Verify UCAN signature + freshness
    └─ packages/ucan/src/verify.ts

2. Load the bound cloud_connection
    └─ apps/pdp/src/services/cloud-internal-client.ts

3. Evaluate Cedar policy
    └─ apps/pdp/src/services/cedar-runner.ts
       Entities loaded: User, Agent, Org, plus a synthetic Resource
       carrying the ARM coordinates.

4. Apply destructive-verb cosigner gate
    └─ apps/pdp/src/services/cloud-risk-rules.ts
       If verb is destructive AND context.cosigner != true,
       force step-up regardless of Cedar's allow.

5. Apply resource_constraint subset check
    └─ packages/ucan/src/constraint.ts
       Issuer-vouched constraint must cover the request resource.

6. Mint Nomos OIDC ID token (RS256)
    └─ apps/control-plane/src/services/oidc-issuer.ts
       Signed by KMS-resident key; jwks at
       https://id.auto-nomos.com/.well-known/jwks.json

7. Exchange for AAD access token
    └─ apps/pdp/src/adapters/cloud.ts
       POST https://login.microsoftonline.com/<tenant>/oauth2/v2.0/token
       grant_type=client_credentials
       client_assertion=<Nomos OIDC ID token>

8. Call ARM
    └─ <method> https://management.azure.com<path>?<query>
       Authorization: Bearer <AAD token>

9. Append audit row
    └─ apps/pdp/src/services/audit-chain.ts
       prev_hash → curr_hash, signed by the daily root.
```

## Three-layer authorization

Every call goes through three independent gates. All three must pass.

| Layer | Where | What it checks | Failure mode |
|---|---|---|---|
| **Schema** | `packages/schema-packs/src/azure/schemas.ts` | `apiCall` shape — method/path/query/body match the command | PDP deny: `schema_violation` (fail-closed; no ARM call attempted) |
| **Cedar policy** | `apps/pdp/src/services/cedar-runner.ts` | Customer-authored Cedar — principal/action/resource match policy | PDP deny: `policy_deny` |
| **Risk rules** | `apps/pdp/src/services/cloud-risk-rules.ts` | Destructive verbs → cosigner required | PDP deny: `cosigner_required` (HTTP 403, step-up flow created) |
| **Resource constraint** | `packages/ucan/src/constraint.ts` | UCAN-vouched constraint covers the requested resource | PDP deny: `resource_mismatch` |

Even a wide-open Cedar policy like `permit (principal, action, resource);`
cannot bypass the risk-rules gate. The cosigner gate is defense in depth.

## The cosigner gate

Destructive verb list (current as of this commit):

```
delete, destroy, terminate, stop, drain, rotate, run_command, invoke,
scale, redeploy, purge, regenerate_key, deallocate, reimage, remove_rule,
detach_disk, capture, uninstall_extension, cancel_run, cancel, power_off,
slot_swap
```

Detection is suffix-based on the last command segment, gated against the
read-verb allowlist (`list, get, read, describe, query`). See
`apps/pdp/src/services/cloud-risk-rules.ts#commandIsDestructive`.

When the gate fires:

1. PDP returns HTTP 403 with `error_code: "cosigner_required"`.
2. A `push_approvals` row is created with `state = pending`.
3. A `stepUpUrl` is returned pointing at `/approve/<stepUpId>` in the
   dashboard.
4. Operator approves via **WebAuthn passkey** (no automation possible by
   design — the platform-private key must sign the approval challenge).
5. Approval mints a **cosigner UCAN** with `meta.cosigner = true`.
6. Agent retries the original call with the cosigner UCAN attached.

The cosigner UCAN is single-use, scoped to the original command, and
expires in 5 minutes by default.

## The audit chain

Every PDP decision — allow, deny, step-up — writes one row to
`audit_chain`:

```
id           uuid
customer_id  uuid
prev_hash    sha256 (links to previous row in the same customer)
curr_hash    sha256
payload_jsonb {
  command, decision, request_resource, decision_reason,
  upstream_status, ucan_jti, agent_id, cloud_connection_id,
  ts
}
signed_root  ed25519 signature once per day
```

The `audit-verify` CLI (in `packages/audit-verify`) walks the chain and
fails on any hash mismatch. The R2 archive at
`s3://nomos-audit-prod/customer=<id>/year=<y>/month=<m>/day=<d>/*.parquet`
is read-only with a 7-year lifecycle.

See [`docs/RBAC.md`](../RBAC.md) for who can view the audit chain.

## Step-up flow vs cosigner flow

These are sometimes conflated. They are not the same:

| | Step-up | Cosigner |
|---|---|---|
| Trigger | Cedar policy explicitly `requires_stepup` OR risk-rule fires | Risk rule fires on destructive verb |
| Approval mechanism | WebAuthn passkey | WebAuthn passkey |
| What the approval mints | A UCAN with `meta.stepup_approved = true` | A UCAN with `meta.cosigner = true` |
| Lifetime | Configurable, default 5min | 5min, single-use |
| Visible in | `/app/approvals` | `/app/approvals` (same UI) |

Step-up is the broader concept; cosigner is the specific case where the
destructive-verb rule fires. The dashboard treats both identically.

## Where each field on a UCAN comes from

| Field | Source |
|---|---|
| `iss` | Control-plane signing key for the customer (rotated quarterly) |
| `aud` | `agents.did` for the requesting agent |
| `cmd` | The command requested by the agent in the mint call |
| `sub` | `customer/<customer_id>/agent/<agent_id>` — used as OIDC subject |
| `pol` | Optional Cedar predicates from the customer's policy |
| `meta.cloud_connection_id` | Resolved from the mint request; verified `bootstrapStatus='verified'` |
| `meta.resource_constraint` | Issuer-applied bound from the policy or mint input |
| `nbf`, `exp` | TTL bounded by policy max (15min default cap) |
| `nonce` | Random; recorded in `ucan_nonces` for replay-prevention |

## What a successful proxy call looks like (full trace)

A successful `GET /azure/vm/list` against subscription `b0afe115…`:

```
[2026-05-18T16:42:01Z] mint-ucan.POST  agent=54a94a01 cmd=/azure/vm/list cloud_conn=d06f898b → jwt issued (exp 600s)
[2026-05-18T16:42:01Z] proxy.POST       /v1/proxy/azure/vm/list
  → cedar.allow                       policy_id=e2e-az… principal=agent/54a94a01
  → risk-rules.skip                   verb=list (read allowlist)
  → constraint.cover                  parent=null child=null (no narrowing)
  → oidc.mint                         sub=customer/ed5398…/agent/54a94a01 exp=120s
  → aad.token                         tenant=5ccf1a9a status=200 ttl=3600s
  → arm.call                          GET management.azure.com/subscriptions/b0afe115…/providers/Microsoft.Compute/virtualMachines?api-version=2024-03-01
  → arm.response                      status=200 bytes=842
  → audit.append                      prev=8a2c…cef9 curr=8ca8…6f93
```

Every line corresponds to a code path in the repo; grep on the event name
to find it.
