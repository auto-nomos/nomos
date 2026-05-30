# Nomos Terraform modules

Three Terraform modules that bootstrap your cloud account to trust Nomos's OIDC
issuer. Pick the cloud you operate in.

Federation means **no long-lived secrets** live in Nomos's database — every PDP
request mints a fresh assertion that your cloud's STS exchanges for a short-lived
access token.

## Pick a module

| Module | Cloud | What it builds |
|---|---|---|
| [`azurerm-nomos-bootstrap`](./azurerm-nomos-bootstrap/) | Azure | App Registration + federated identity credentials + role assignment. |
| [`aws-nomos-bootstrap`](./aws-nomos-bootstrap/) | AWS | IAM role with OIDC trust + permission policy. |
| [`google-nomos-bootstrap`](./google-nomos-bootstrap/) | GCP | Workload Identity Pool + provider + service account. |

## Common shape

All three take the same conceptual inputs:

- `customer_id` — your Nomos org id (from `/app/settings/organization`).
- `nomos_oidc_issuer` — public Nomos issuer URL. Default: `https://id.auto-nomos.com`.
- Cloud-specific resource identifier (subscription id / account id / project id).
- Allowed actions / role names.

All three emit the same conceptual outputs:

- An identity identifier you paste into the Nomos dashboard
  (`/app/cloud/connect/<cloud>`).
- A list of agent ids whose federated credentials have been pre-provisioned.

## Choosing a starting scope

Read access first. The default role / IAM policy in each module is "list + get,"
which lets you wire the federation end-to-end without granting writes. Once
verified, broaden the scope for the actions your agents actually need.

## What lives outside Terraform

- **OAuth-based providers** (GitHub, Slack, etc.) — done from the dashboard's
  `/app/connections` page, not Terraform.
- **Per-agent federated credentials on Azure** — Microsoft requires exact-string
  subjects, no wildcards. Add new agent ids to `additional_agent_ids` and re-run
  Terraform, or use the dashboard's one-shot `az` command per agent.
- **Customer-managed audit signing keys** — Phase 2; not yet exposed via the
  bootstrap modules.

## Self-host the PDP itself

The bootstrap modules just wire your cloud to trust Nomos's hosted broker. To
**run the broker in your own cloud**, see the self-host walkthrough:

[docs.auto-nomos.com/operate/self-host-terraform](https://app.auto-nomos.com/docs/operate/self-host-terraform)

## Module versioning

All three modules are versioned together at the repo level. Pin to a tag in your
Terraform source URL:

```hcl
source = "git::https://github.com/auto-nomos/nomos.git//infra/terraform/azurerm-nomos-bootstrap?ref=v0.1.0"
```

`main` is the working branch; tags are the supported pins.
