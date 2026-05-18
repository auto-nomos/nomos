# Nomos for Azure

Nomos brokers Azure Resource Manager (ARM) and data-plane calls on behalf of
autonomous agents. Agents never hold an Azure client secret, certificate, or
service-principal credential. Instead, Nomos mints short-lived UCANs scoped
to specific commands and resources, federates the agent identity to Microsoft
Entra ID via OpenID Connect, exchanges the OIDC ID token for a real ARM access
token, and proxies the call.

Every request is policy-evaluated (Cedar), risk-evaluated (destructive verbs
require co-signature), and chain-audited (Postgres + R2 Parquet archive).

This documentation set covers the full lifecycle: onboarding an Azure
subscription, designing least-privilege scopes, the full action catalog,
end-to-end use cases, the wire-level API, the MCP integration for IDE
agents, and a troubleshooting reference.

## Table of contents

| Guide | What it covers |
|---|---|
| [Getting started](./getting-started.md) | Terraform bootstrap, App Registration, federated identity credentials, dashboard cloud-connect, verifying the connection, registering test agents. |
| [Concepts](./concepts.md) | Federation chain, UCAN envelope, Cedar policy evaluation, cosigner gate, audit chain, resource constraint model. |
| [Permissions and scopes](./permissions-and-scopes.md) | Role assignment strategy (Reader, Contributor, custom roles), narrowing scope to subscriptions / resource groups / individual resources, UCAN `AzureConstraint` field reference, three-layer authorization model. |
| [Actions reference](./actions-reference.md) | All 253 actions grouped by Azure service, with HTTP method, ARM URL template, required role, and risk class. |
| [Use cases](./use-cases.md) | Cost analysis, incident response, security posture review, AKS operations, secret rotation, infra-as-code from prompts, dev/test cleanup, blue-green deploys. |
| [API reference](./api-reference.md) | `/v1/mint-ucan`, `/v1/proxy/*`, `/v1/authorize`, `/v1/intent`, `/v1/stepup`, tRPC procedures for cloud connections and agents, error code dictionary. |
| [MCP integration](./mcp-integration.md) | `@auto-nomos/mcp-server` Azure tool catalog (50+ semantic tools + `azure_raw_call` escape hatch), Cursor and Claude Code installation, tool-naming convention, IDE-side configuration. |
| [Troubleshooting](./troubleshooting.md) | AADSTS error catalog, federated identity credential issues, Azure subscription policy blockers, schema-violation diagnostics, audit-trail forensics. |

## Architecture diagram (at-a-glance)

```
┌─────────────┐   1. POST /v1/mint-ucan       ┌──────────────────┐
│             │ ─────────────────────────────►│                  │
│   Agent     │   Authorization: Bearer       │  Control Plane   │
│  (Cursor /  │   { command, cloud_conn_id }  │  api.auto-       │
│   Claude /  │ ◄───────────────────────────  │   nomos.com      │
│   SDK)      │   { ucan: "eyJh…" }           │                  │
└──────┬──────┘                               └────────┬─────────┘
       │                                               │
       │   2. POST /v1/proxy/azure/<command>           │
       │      x-cb-customer, request{ucan, apiCall…}   │
       │                                               │
       ▼                                               │
┌──────────────────┐                                   │
│       PDP        │   3. Cedar evaluate ─┐            │
│ pdp.auto-nomos…  │   4. cosigner gate ──┤            │
│                  │   5. mint Nomos OIDC ─┐           │
│                  │       (id.auto-nomos.com)         │
│                  │                       │           │
│                  │   6. POST /oauth2/v2.0/token      │
│                  │      Microsoft Entra ID           │
│                  │ ◄─────── AAD access_token ◄────── │
│                  │                                   │
│                  │   7. PATCH /subscriptions/…       │
│                  │      management.azure.com          │
│                  │ ◄────── ARM 200 OK ◄──────────────│
│                  │                                   │
│                  │   8. emit audit row (hash-chained)│
│                  │      + R2 parquet roll            │
└──────────────────┘
```

## Standards and conventions

- **Command grammar:** `/azure/<service>/<verb>` (lowercase, snake_case, slash-separated). Every action is a command; every command has an exact schema in `@auto-nomos/schema-packs`.
- **HTTP methods:** GET for reads, PUT for full upserts, PATCH for partial updates, DELETE for destruction, POST for triggers and data-plane writes.
- **ARM API versions:** Set per resource-provider; defaults pinned in `packages/mcp-server/src/tools/azure.ts` and rolled forward via PR review.
- **Identifiers:** Subscription, resource-group, resource-type, name — always ARM-canonical (`Microsoft.Compute/virtualMachines`, not friendly names).
- **Risk classes:** `read` / `non_destructive_write` / `destructive` / `data_plane`. Destructive class always invokes the cosigner gate, even if Cedar would have allowed it.
- **Versioning:** Public npm packages — `@auto-nomos/schema-packs`, `@auto-nomos/sdk`, `@auto-nomos/mcp-server` — follow semver; breaking action removals get major bumps.

## Where things live

| Component | Path |
|---|---|
| ARM URL templates + semantic MCP tools | `packages/mcp-server/src/tools/azure.ts` |
| Action catalog + risk classification | `packages/schema-packs/src/azure/actions.ts` |
| Per-action request schemas | `packages/schema-packs/src/azure/schemas.ts` |
| UCAN `AzureConstraint` shape | `packages/shared-types/src/ucan.ts` |
| Resource-constraint subset check | `packages/ucan/src/constraint.ts` |
| Cedar entity loaders, decision tracing | `apps/pdp/src/services/` |
| Destructive-verb cosigner gate | `apps/pdp/src/services/cloud-risk-rules.ts` |
| ARM federation handshake (Nomos OIDC → AAD → ARM) | `apps/pdp/src/adapters/cloud.ts`, `apps/control-plane/src/routes/cloud-internal.ts` |
| Cloud-connection CRUD + verify | `apps/control-plane/src/trpc/routers/cloud-connections.ts` |
| Mint endpoint | `apps/control-plane/src/routes/mint-ucan.ts`, `apps/control-plane/src/services/ucan-mint.ts` |
| Onboarding terraform | `infra/terraform/azurerm-nomos-bootstrap/`, `infra/terraform/examples/azure-sandbox.tf` |

## Status (2026-05-18)

| Capability | State |
|---|---|
| OIDC federation to Entra ID | GA — `https://id.auto-nomos.com`, RS256, signed by KMS-resident key |
| Reader-tier coverage | 105 read actions, ARM 2xx verified on 36 endpoints against prod sub `b0afe115` |
| Destructive cosigner gate | GA — 73 destructive paths gated, 0 misses in benchmark |
| Contributor-tier writes | GA — proven 2026-05-18 via `scripts/prod-azure-mutate.mts` (3/3 PASS) |
| MCP server tool exposure | 50+ semantic tools + `azure_raw_call` escape hatch (`@auto-nomos/mcp-server@0.0.19`) |
| Audit chain | Postgres hash-chain + daily R2 parquet archive (7-year lifecycle) |
| WebAuthn cosigner approve | GA — passkey-bound approval, no automation possible by design |
