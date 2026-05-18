# Getting started with Nomos for Azure

This guide walks you from a fresh Azure subscription to an agent that can
call ARM through Nomos. The flow is:

1. **Bootstrap** an Azure App Registration with federated identity trust to
   the Nomos OIDC issuer (Terraform).
2. **Connect** the bootstrap output to your Nomos organization (dashboard
   or tRPC).
3. **Verify** the connection — Nomos calls a dummy ARM endpoint with a
   `verify-poll` federated credential.
4. **Create** an agent and register a federated identity credential per
   agent (Terraform).
5. **Mint** a UCAN and **call ARM** through the broker.

Each step is reversible. Tear-down is `terraform destroy` plus revoking
the dashboard cloud connection.

## Prerequisites

| You need | Where |
|---|---|
| An Azure subscription you can install role assignments on | Azure Portal → Subscriptions |
| A Microsoft account or service principal with Owner or User Access Administrator on that subscription | Azure Portal → IAM |
| A Nomos organization | Sign up at `app.auto-nomos.com` |
| Terraform 1.5+ | `brew install terraform` |
| `az` CLI (optional but recommended) | `brew install azure-cli` |

## Step 1 — Bootstrap with Terraform

Clone the public bootstrap module:

```bash
git clone https://github.com/varendra007/nomos-terraforms.git
cd nomos-terraforms
```

Create `main.tf`:

```hcl
terraform {
  required_providers {
    azurerm = { source = "hashicorp/azurerm", version = "~> 4.0" }
    azuread = { source = "hashicorp/azuread", version = "~> 3.0" }
  }
}

module "nomos_azure" {
  source = "./azurerm-nomos-bootstrap"

  customer_id     = "<your nomos org uuid>"   # from /app/settings/workspace
  subscription_id = "<your azure subscription uuid>"

  # Optional — defaults to subscription-scope Reader.
  role_definition_name = "Reader"
  resource_group_name  = ""   # empty == subscription scope
}

output "paste_into_nomos_dashboard" {
  value = {
    app_object_id   = module.nomos_azure.app_object_id
    app_client_id   = module.nomos_azure.app_client_id
    tenant_id       = module.nomos_azure.tenant_id
    subscription_id = module.nomos_azure.subscription_id
  }
}
```

Apply:

```bash
az login
az account set --subscription <subscription-id>

terraform init
terraform apply
```

What this provisions:

- **App Registration** `nomos-agent-broker` (display name configurable).
- **Service Principal** for that app.
- **Federated identity credential** with subject `customer/<customer_id>/agent/verify-poll` — the dashboard "Verify now" probe uses this.
- **Role assignment** of `Reader` (or whatever you specified) scoped to the subscription (or resource group if `resource_group_name` was set).

Terraform output:

```
paste_into_nomos_dashboard = {
  app_object_id   = "7ebcb507-…"
  app_client_id   = "97e54da5-…"
  tenant_id       = "5ccf1a9a-…"
  subscription_id = "b0afe115-…"
}
```

## Step 2 — Connect to Nomos

Dashboard route: `/app/cloud/connect/azure`.

| Form field | Value |
|---|---|
| Subscription id | `subscription_id` from terraform output |
| Tenant id | `tenant_id` |
| App object id | `app_object_id` |
| App client id | `app_client_id` |
| Display name | Your label, e.g. `prod-readonly`, `azure-sandbox` |

Save. The dashboard creates a row in `cloud_connections` with
`bootstrap_status = 'pending'` and triggers `verifyNow` on click.

> If you prefer the API, see [`api-reference.md` → cloudConnections.create](./api-reference.md#cloudconnectionscreate).

## Step 3 — Verify

The dashboard calls `cloudConnections.verifyNow` which:

1. Mints a fresh Nomos OIDC ID token with subject `customer/<customer_id>/agent/verify-poll`.
2. Posts it to `https://login.microsoftonline.com/<tenant_id>/oauth2/v2.0/token` with `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer`.
3. Receives an AAD access token.
4. Calls `GET https://management.azure.com/subscriptions/<sub>?api-version=2022-12-01`.
5. On HTTP 200 → flips `bootstrap_status` to `verified`.

If verification fails, the dashboard surfaces the error code. The most
common ones are listed in [`troubleshooting.md`](./troubleshooting.md).

## Step 4 — Create an agent + register its FIC

Agents need their own federated identity credential. Azure does **not**
support wildcard subjects on custom OIDC issuers, so you create one FIC
per agent.

### 4a. Create the agent

Dashboard: `/app/agents/new` → name → Save. Copy the agent uuid.

API equivalent:

```bash
curl -X POST https://api.auto-nomos.com/trpc/agents.create?batch=1 \
  -H 'content-type: application/json' \
  -H 'cookie: __Secure-better-auth.session_token=…' \
  -H 'x-cb-org: <customer-id>' \
  -d '{"0":{"json":{"name":"my-agent","requireApproval":false}}}'
```

### 4b. Register the FIC

Rerun terraform with the agent id passed in:

```bash
terraform apply -var='additional_agent_ids=["<agent-uuid>"]'
```

This adds an `azuread_application_federated_identity_credential` resource
with:

| Field | Value |
|---|---|
| `issuer` | `https://id.auto-nomos.com` |
| `subject` | `customer/<customer_id>/agent/<agent_uuid>` |
| `audiences` | `["api://AzureADTokenExchange"]` |

You can also do this with the `az` CLI:

```bash
az ad app federated-credential create \
  --id <app_object_id> \
  --parameters '{
    "name": "nomos-<customer>-<agent>",
    "issuer": "https://id.auto-nomos.com",
    "subject": "customer/<customer_id>/agent/<agent_uuid>",
    "audiences": ["api://AzureADTokenExchange"]
  }'
```

> **Limit:** Microsoft Entra ID caps each App Registration at **20 federated
> credentials**. If you exceed it, either group agents under multiple App
> Registrations (one cloud connection per app) or reuse short-lived agents.

## Step 5 — Mint a UCAN and call ARM

Get the agent's API key from `/app/agents/<id>` (one-time-reveal).

```bash
# Mint a UCAN for a single command.
curl -X POST https://api.auto-nomos.com/v1/mint-ucan \
  -H 'authorization: Bearer <api-key>' \
  -H 'content-type: application/json' \
  -d '{
    "commands": ["/azure/vm/list"],
    "cloudConnectionId": "<cloud_connection_id>",
    "ttlSeconds": 600
  }'

# Response:
# { "ucans": [{ "jwt": "eyJh…", "command": "/azure/vm/list", "expiresAt": "…" }] }
```

```bash
# Call ARM through the PDP proxy.
curl -X POST https://pdp.auto-nomos.com/v1/proxy/azure/vm/list \
  -H 'content-type: application/json' \
  -H 'x-cb-customer: <customer-id>' \
  -d '{
    "ucan": "eyJh…",
    "request": {
      "ucan": "eyJh…",
      "command": "/azure/vm/list",
      "resource": { "subscription_id": "<sub>" },
      "context": { "command": "/azure/vm/list" }
    },
    "apiCall": {
      "method": "GET",
      "path": "/subscriptions/<sub>/providers/Microsoft.Compute/virtualMachines",
      "query": { "api-version": "2024-03-01" }
    }
  }'
```

The PDP response wraps the ARM response and includes a hash-chain receipt:

```json
{
  "allow": true,
  "decision": { "allow": true, "receiptId": "8ca8…" },
  "upstream": {
    "status": 200,
    "body": { "value": [/* VM list */] },
    "headers": { /* ARM response headers */ }
  },
  "connection": { "id": "<cloud_conn>", "connector": "azure" }
}
```

## Step 6 — Use the high-level SDK

The TypeScript SDK abstracts the mint + proxy pattern:

```ts
import { NomosClient } from '@auto-nomos/sdk';

const nomos = new NomosClient({
  apiKey: process.env.NOMOS_API_KEY,
  cloudConnectionId: '<cloud_conn>',
});

const { value: vms } = await nomos.azure.vm.list({ subscription_id: '<sub>' });
```

See [API reference](./api-reference.md) for the full SDK surface.

## Tear-down

```bash
# Inside the terraform directory:
terraform destroy

# In the Nomos dashboard, optionally remove the cloud_connection row
# via /app/cloud/<connection-id> → Delete. (Terraform destroy already
# removes the App Reg + FICs + role assignment from Azure.)
```

## Next

- [Pick the right role and scope](./permissions-and-scopes.md) — when to use Reader vs Contributor vs custom roles.
- [Browse the action catalog](./actions-reference.md) — 253 Azure commands grouped by service.
- [Wire up MCP for your IDE](./mcp-integration.md) — let Cursor/Claude Code talk to ARM directly.
