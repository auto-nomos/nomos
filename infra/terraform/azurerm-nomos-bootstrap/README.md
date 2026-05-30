# terraform-azurerm-nomos-bootstrap

Bootstrap an Azure tenant to trust the Nomos OIDC issuer. Creates an App
Registration + federated identity credentials + a Reader role assignment so
the Nomos PDP can broker short-lived access tokens for agent requests
against `management.azure.com`.

> **End-to-end walkthrough with screenshots:**
> [docs.auto-nomos.com/providers/cloud-azure](https://app.auto-nomos.com/docs/providers/cloud-azure)

## Before you start

- Azure subscription with **Owner** or **User Access Administrator** on the
  target subscription or resource group.
- `az login` completed (Terraform reuses the CLI's auth).
- Terraform 1.5+ with the `azurerm` and `azuread` providers.
- Your Nomos `customer_id` from `/app/settings/organization`.

## Usage

```hcl
module "nomos" {
  source = "git::https://github.com/varendra007/nomos-terraforms.git//azurerm-nomos-bootstrap?ref=main"

  customer_id     = "your-nomos-customer-uuid"          # from /app/settings/workspace
  subscription_id = "00000000-0000-0000-0000-000000000000"

  # Add real agent_ids here as you create agents in the Nomos dashboard.
  # One federated credential is created per id; Azure caps total at 20.
  # The "verify-poll" id is always included automatically.
  additional_agent_ids = [
    # "agt_01H9XYZ...",
    # "agt_01HABCD...",
  ]

  # Optional — narrow to one RG instead of subscription scope:
  # resource_group_name = "rg-agent-sandbox"
}

output "nomos_paste_into_dashboard" {
  value = {
    app_object_id   = module.nomos.app_object_id
    app_client_id   = module.nomos.app_client_id
    tenant_id       = module.nomos.tenant_id
    subscription_id = module.nomos.subscription_id
  }
}
```

## What it creates

| Resource | Purpose |
|---|---|
| `azuread_application.nomos` | App Registration the federation trusts. |
| `azuread_service_principal.nomos` | SP the role assignment binds to. |
| `azuread_application_federated_identity_credential.nomos` (per agent_id) | Trust block — issuer = Nomos OIDC, subject = exact `customer/{cid}/agent/{agent_id}`. |
| `azurerm_role_assignment.nomos` | Reader at subscription or RG scope. |

## Variables

| Name | Description | Default |
|---|---|---|
| `customer_id` | Nomos customer id. Required. | — |
| `subscription_id` | Azure subscription id. Required. | — |
| `additional_agent_ids` | Extra agent_ids that should be allowed (one FIC each). | `[]` |
| `nomos_oidc_issuer` | Public Nomos issuer URL. | `https://id.auto-nomos.com` |
| `resource_group_name` | Narrow Reader to one RG. Empty = subscription scope. | `""` |
| `app_display_name` | App Registration display name. | `nomos-agent-broker` |
| `role_definition_name` | Built-in role to assign. | `Reader` |

## Outputs

Paste these into the Nomos dashboard at `/app/cloud/connect/azure`:

- `app_object_id`
- `app_client_id`
- `tenant_id`
- `subscription_id`

`agent_ids_with_credentials` is also emitted for verification.

## Verify

After `terraform apply`:

1. Dashboard → `/app/cloud/connect/azure` → paste outputs → **Test**.
2. Dashboard mints a no-op assertion, exchanges it via Azure STS, calls
   `https://management.azure.com/subscriptions/<id>` with the resulting AAD token.
3. Green check = federation works. Red = check the troubleshooting section below
   and the `agent_ids_with_credentials` output.

Smoke-test from CLI:

```bash
# Confirm the federation accepts at least one assertion:
curl -X POST "https://login.microsoftonline.com/$(terraform output -raw tenant_id)/oauth2/v2.0/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=$(terraform output -raw app_client_id)" \
  -d "scope=https://management.azure.com/.default" \
  -d "grant_type=client_credentials" \
  -d "client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer" \
  -d "client_assertion=<assertion-jwt-from-nomos-issuer>"
```

Use the dashboard's one-click test if you don't want to mint assertions manually.

## How the federation works

1. Nomos mints an OIDC ID token signed by an RS256 key.
2. Token claims include `iss=https://id.auto-nomos.com`, `sub=customer/{cid}/agent/{agent_id}`, `aud=api://AzureADTokenExchange`.
3. Nomos POSTs the token to `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token` with `grant_type=client_credentials`, `client_assertion_type=...:jwt-bearer`, `client_assertion=<id-token>`, `scope=https://management.azure.com/.default`.
4. AAD validates the token against `id.auto-nomos.com/.well-known/openid-configuration` and the federated identity credential whose subject exactly matches `customer/{cid}/agent/{agent_id}`, returns an AAD access token.
5. PDP attaches the AAD token as `Authorization: Bearer` to ARM calls.

No long-lived secrets leave the customer's tenant. Nomos never holds a client secret or service-principal password.

## Important — Azure federated credential constraints

- **No wildcards.** Subject must be an exact string match. `customer/{cid}/agent/*` does **not** behave as a wildcard — Azure treats `*` as a literal character and rejects all tokens.
- **Flexible FIC blocked for custom issuers.** Microsoft Entra ID restricts `claimsMatchingExpression` to a small set of trusted issuers (GitHub, Terraform Cloud, etc.) — it returns `Expression is not supported for applications in this cloud 'Public' using issuer 'https://id.auto-nomos.com'`. This module therefore creates one exact-match FIC per agent_id.
- **20-credential cap per app.** If you need more than 20 agents talking to Azure under the same customer, deploy this module twice (two App Registrations) or split agents across multiple Azure subscriptions.

## Adding a new agent later

Append the agent_id to `additional_agent_ids` and re-run `terraform apply`. The module will create the additional FIC without touching the rest.

> **This is not optional.** Azure rejects every token whose subject doesn't match a registered FIC with `AADSTS700213: No matching federated identity record found`. The Nomos dashboard surfaces the exact `az` command for each new app you register, but the credential has to live in your tenant — Nomos cannot create it on your behalf.

### One-shot Azure CLI (alternative to re-running Terraform)

```bash
az ad app federated-credential create \
  --id <app_object_id> \
  --parameters '{
    "name": "nomos-<short-agent-name>",
    "issuer": "https://id.auto-nomos.com",
    "subject": "customer/<your-customer-id>/agent/<agent_id>",
    "audiences": ["api://AzureADTokenExchange"]
  }'
```

Both the dashboard agent detail page and `terraform output agent_ids_with_credentials` give you the agent_id values to plug in.

## Customising the role

`role_definition_name = "Reader"` is the safest default. To allow writes, change it (e.g. `"Contributor"`) or add separate `azurerm_role_assignment` blocks in your own Terraform that bind to `module.nomos.app_object_id`.
