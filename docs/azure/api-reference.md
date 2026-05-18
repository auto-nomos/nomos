# API reference

Every Nomos endpoint that participates in the Azure flow. Treat this as
the wire contract; SDKs ([TypeScript](#sdk-typescript)) wrap it.

## Base URLs

| Service | Production | Notes |
|---|---|---|
| Control plane | `https://api.auto-nomos.com` | tRPC + REST mint endpoint + Better-Auth |
| PDP | `https://pdp.auto-nomos.com` | `/v1/proxy/*`, `/v1/authorize`, `/v1/receipts` |
| Dashboard | `https://app.auto-nomos.com` | Next.js UI |
| OIDC issuer | `https://id.auto-nomos.com` | `.well-known/openid-configuration`, `.well-known/jwks.json` |

All endpoints accept JSON. Errors are HTTP status + `{ error_code, message }`.

## Authentication

| Surface | Header |
|---|---|
| Agent → Control Plane (`/v1/mint-ucan`) | `Authorization: Bearer <api-key>` |
| Agent → PDP (`/v1/proxy/*`, `/v1/authorize`) | `x-cb-customer: <customer-id>` + UCAN in body |
| Operator → Dashboard tRPC | `Cookie: __Secure-better-auth.session_token=…` + `x-cb-org: <customer-id>` |

API keys are issued from the dashboard (`/app/agents/<id>` → Generate
API key) and are revealed once. Store at rest encrypted; never bake into
images.

---

## Control plane endpoints

### POST `/v1/mint-ucan`

Mints one UCAN per command requested.

**Request**

```jsonc
{
  "commands": ["/azure/vm/list", "/azure/vm/get"],  // 1..32 commands
  "cloudConnectionId": "d06f898b-…",                 // required for /azure /aws /gcp
  "ttlSeconds": 600,                                  // optional, capped at 900
  "resourceConstraint": {                             // optional override (must be subset of policy)
    "provider": "azure",
    "subscription_id": "b0afe115-…",
    "resource_group": "prod-app-eus"
  },
  "policyOverrides": [                                // optional Cedar predicates
    ["resource.tag.cost-center", "==", "rd-1234"]
  ]
}
```

**Response**

```jsonc
{
  "ucans": [
    {
      "command": "/azure/vm/list",
      "jwt": "eyJh…",
      "expiresAt": "2026-05-18T16:52:01.123Z"
    },
    {
      "command": "/azure/vm/get",
      "jwt": "eyJh…",
      "expiresAt": "2026-05-18T16:52:01.123Z"
    }
  ]
}
```

**Errors**

| HTTP | error_code | Meaning |
|---|---|---|
| 401 | `auth_failure` | API key invalid or revoked |
| 400 | `policy_deny` | Agent's Cedar policy disallows the command |
| 412 | `cloud_connection_not_verified` | `cloudConnectionId` exists but `bootstrapStatus != 'verified'` |
| 400 | `cloud_connection_provider_mismatch` | Command is `/aws/…` but connection is `azure`, etc |
| 400 | `unknown_command` | Command not in schema-packs |
| 400 | `constraint_not_subset` | `resourceConstraint` widens what the policy allows |
| 429 | `mint_rate_limit` | Per-agent rate limit hit |

### POST `/v1/mint-ucan` (cosigner mint)

Same endpoint, with `mode: "cosigner"` and the original UCAN as
`parentJwt`. Returns a cosigner UCAN bound to one command, one
resource, valid for 5 minutes.

```jsonc
{
  "mode": "cosigner",
  "parentJwt": "<original ucan jwt>",
  "stepUpId": "8856011e-…"   // from PDP 403 cosigner_required response
}
```

The endpoint requires a fresh WebAuthn assertion (passed as
`x-cb-webauthn-assertion` header) — passkey unblockable; not callable
from a bot.

---

## PDP endpoints

### POST `/v1/proxy/<command>`

Forwards an ARM call. `<command>` is the literal command string with
slashes preserved (e.g. `/v1/proxy/azure/vm/list`).

**Headers**

```
content-type: application/json
x-cb-customer: <customer-id>
```

**Request**

```jsonc
{
  "ucan": "eyJh…",                  // UCAN from /v1/mint-ucan
  "request": {
    "ucan": "eyJh…",                // same; PDP cross-checks
    "command": "/azure/vm/list",
    "resource": {
      "subscription_id": "b0afe115-…",
      "resource_group": "prod-app-eus",
      "resource_type": "Microsoft.Compute/virtualMachines",
      "name": "web-001"
    },
    "context": {
      "command": "/azure/vm/list",   // PDP binds to action
      "cosigner": false,
      "cosignerJwt": "eyJh…"          // optional, for retry after step-up
    }
  },
  "apiCall": {
    "method": "GET",
    "path": "/subscriptions/b0afe115-…/providers/Microsoft.Compute/virtualMachines",
    "query": { "api-version": "2024-03-01" },
    "body": { /* required for PUT/PATCH/POST */ }
  }
}
```

**Successful response (HTTP 200)**

```jsonc
{
  "allow": true,
  "decision": {
    "allow": true,
    "receiptId": "8ca8…",
    "reason": "policy_allow"
  },
  "upstream": {
    "status": 200,
    "body": { /* verbatim ARM response */ },
    "headers": {
      "content-type": "application/json; charset=utf-8",
      "x-ms-request-id": "0d8556c4-…"
    }
  },
  "connection": {
    "id": "d06f898b-…",
    "connector": "azure"
  }
}
```

**Cosigner-required response (HTTP 403)**

```jsonc
{
  "allow": false,
  "error_code": "cosigner_required",
  "decision": {
    "allow": false,
    "receiptId": "8ca8…",
    "reason": "destructive_cloud_action_requires_cosigner"
  },
  "stepUpId": "8856011e-…",
  "stepUpUrl": "https://app.auto-nomos.com/approve/8856011e-…",
  "expiresAt": "2026-05-18T16:50:00Z"
}
```

**Schema-violation response (HTTP 400)**

```jsonc
{
  "allow": false,
  "error_code": "schema_violation",
  "decision": {
    "allow": false,
    "receiptId": "8ca8…",
    "reason": "apiCall.body required for /azure/nsgs/add_rule but missing"
  }
}
```

**Cloud federation failure (HTTP 502)**

```jsonc
{
  "allow": true,                    // PDP allowed, but ARM didn't
  "error_code": "cloud_call_failed",
  "decision": { "allow": true, "receiptId": "8ca8…" },
  "providerStatus": 401,
  "providerBody": {
    "error": { "code": "AADSTS70021", "message": "No matching federated identity record found…" }
  }
}
```

The `providerBody` field reveals the AAD or ARM error verbatim. The PDP
forwards both `camelCase` and `snake_case` to handle SDK heterogeneity
(`apps/pdp/src/adapters/cloud.ts`).

### POST `/v1/authorize`

Dry-run authorization. Same input shape as `/v1/proxy/<command>` but
returns the decision without calling ARM. Used by SDK pre-flight checks.

### POST `/v1/intent`

Submits a *dynamic intent* for evaluation. The PDP runs all matched
policies and returns either `allow`, `deny`, or `stepup`. Intents are
useful when an agent wants to ask "can I do X if I get cosigner?" before
spending the round trip on `/v1/proxy/*`.

### POST `/v1/receipts`

Look up a receipt by id. Returns the hash-chained audit row.

```jsonc
// Request
{ "receiptId": "8ca8…" }

// Response
{
  "receipt": {
    "id": "8ca8…",
    "prev_hash": "8a2c…",
    "curr_hash": "8ca8…",
    "payload": { /* full decision */ },
    "signed_root": "ed25519:…"
  }
}
```

---

## tRPC procedures (`/trpc/<router>.<procedure>`)

Standard tRPC wire format: `POST /trpc/x.y?batch=1` with body
`{"0":{"json":<input>}}`. Reads use `GET ?input=<url-encoded JSON>`.

### `cloudConnections.create`

Creates a new cloud connection row. Returns the row including the
generated id.

```ts
{
  connector: 'azure',
  accountId: '<subscription-uuid>',
  tenantId:  '<tenant-uuid>',
  externalId: '<app-object-id>',
  displayName: 'prod-readonly',
  config: { app_client_id: '<app-client-id>' },
}
```

### `cloudConnections.list`

Returns all cloud connections in the current org.

### `cloudConnections.verifyNow`

Runs the federation handshake against the connection. Returns
`{ status: 'verified' | 'failed' }` and updates `bootstrapStatus`.

```ts
{ connectionId: '<uuid>' }
```

### `cloudConnections.update`

Updates `displayName` or `config` (rotate `app_client_id`).

```ts
{ connectionId: '<uuid>', displayName?: '…', config?: { … } }
```

### `cloudConnections.delete`

Soft-deletes a connection. Any UCAN bound to it stops minting.

### `agents.create` / `agents.list` / `agents.update`

Standard CRUD. `create` returns the agent id; you then use it as the
`subject` suffix when registering the FIC.

### `apiKeys.create`

```ts
{ agentId: '<uuid>', name: 'rotator-key', role: 'admin' | 'agent' }
```

Returns `{ id, plaintextOnce }`. The plaintext is shown once.

### `policies.upsert` / `policies.assignAgents`

Cedar policy CRUD. `assignAgents` binds a policy to a list of agent ids.

### `stepup.listPending` / `stepup.deny` / `stepup.approve`

Step-up workflow. `approve` requires a WebAuthn assertion and is
gated by Better-Auth.

---

## SDK (TypeScript)

```bash
npm install @auto-nomos/sdk
```

```ts
import { NomosClient } from '@auto-nomos/sdk';

const nomos = new NomosClient({
  apiKey:               process.env.NOMOS_API_KEY!,
  cloudConnectionId:    'd06f898b-…',
  // Optional defaults that get merged into every call:
  defaultResource:      { subscription_id: 'b0afe115-…' },
  defaultContext:       { command: '/azure/…' },  // SDK sets this per call
  resourceConstraint:   { provider: 'azure', subscription_id: 'b0afe115-…' },
  // Configurable hosts (default points at prod):
  controlPlaneUrl:      'https://api.auto-nomos.com',
  pdpUrl:               'https://pdp.auto-nomos.com',
});

// Reads — return verbatim ARM body.
const vms = await nomos.azure.vm.list({ subscription_id: SUB });

// Writes — Body schema enforced client-side too.
await nomos.azure.tags.set({
  subscription_id: SUB,
  resource_group: 'prod-app-eus',
  body: { properties: { tags: { 'cost-center': 'rd-1234' } } },
});

// Destructive — call returns 403 first; SDK exposes the stepUpUrl.
try {
  await nomos.azure.vm.delete({
    subscription_id: SUB, resource_group: 'prod-app-eus', name: 'web-001',
  });
} catch (err) {
  if (err.code === 'cosigner_required') {
    console.log(`approve at ${err.stepUpUrl}`);
    // … wait, then call again with err.cosignerJwt attached.
  }
}

// Raw escape hatch.
await nomos.azure.raw_call({
  method: 'GET',
  path: '/providers/Microsoft.ResourceHealth/availabilityStatuses',
  query: { 'api-version': '2024-02-01' },
});
```

### SDK options reference

| Field | Type | Default | Notes |
|---|---|---|---|
| `apiKey` | string | — | Required |
| `cloudConnectionId` | string | — | Required for cloud commands |
| `controlPlaneUrl` | string | `https://api.auto-nomos.com` | Override for self-hosted |
| `pdpUrl` | string | `https://pdp.auto-nomos.com` | Override for self-hosted |
| `defaultResource` | object | `{}` | Merged into every call's `resource` |
| `defaultContext` | object | `{ command }` | Merged into every call's `context` |
| `resourceConstraint` | `ResourceConstraint` | — | Per-client UCAN constraint |
| `failureMode` | `'deny' \| 'open'` | `'deny'` | If PDP unreachable; only set `open` in dev |

### Programmatic action discovery

```ts
import { actions, actionToCommand } from '@auto-nomos/schema-packs/azure';

for (const cmd of actions) {
  if (cmd.startsWith('/azure/vm/')) console.log(cmd);
}
```

---

## Error code dictionary

| Code | Source | HTTP | Meaning |
|---|---|---|---|
| `auth_failure` | Control plane | 401 | API key invalid |
| `unknown_command` | Control plane / PDP | 400 | Command not registered |
| `schema_violation` | PDP | 400 | apiCall shape doesn't match schema |
| `policy_deny` | PDP (Cedar) | 403 | Policy explicitly denied |
| `policy_no_match` | PDP (Cedar) | 403 | No policy matched (defaults to deny) |
| `cosigner_required` | PDP (risk-rules) | 403 | Destructive verb; step-up needed |
| `step_up_required` | PDP (Cedar) | 403 | Policy required cosigner |
| `resource_mismatch` | PDP (constraint) | 403 | UCAN constraint doesn't cover request resource |
| `ucan_expired` | PDP | 401 | UCAN `exp` in past |
| `ucan_invalid_signature` | PDP | 401 | UCAN signature doesn't verify |
| `ucan_replay` | PDP | 409 | Nonce already used |
| `cloud_connection_not_verified` | Control plane | 412 | `verifyNow` hasn't succeeded |
| `cloud_call_failed` | PDP | 502 | Upstream ARM or AAD error; see `providerBody` |
| `cloud_federation_failed` | PDP | 502 | AAD token exchange failed; see `providerBody` |
| `mint_rate_limit` | Control plane | 429 | Per-agent rate limit |
| `pdp_invalid_response` | SDK | n/a | PDP response malformed (typically missing `receiptId`) |

---

## Webhook events

If `cloud_connections.config.webhookUrl` is set, the broker POSTs the
following events:

```jsonc
{
  "event": "stepup.created",
  "data": {
    "stepUpId": "8856011e-…",
    "command": "/azure/vm/delete",
    "agentId": "54a94a01-…",
    "stepUpUrl": "https://app.auto-nomos.com/approve/8856011e-…"
  }
}
```

| Event | Trigger |
|---|---|
| `stepup.created` | Cosigner-gate or policy step-up fires |
| `stepup.approved` | Operator approves via WebAuthn |
| `stepup.denied` | Operator denies |
| `audit.daily_root_signed` | Daily audit root signed by ed25519 key |
| `cloud_connection.verified` | `bootstrapStatus` flipped to `verified` |
| `cloud_connection.failed` | Periodic re-verify failed |
