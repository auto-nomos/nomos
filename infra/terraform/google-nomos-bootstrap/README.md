# terraform-google-nomos-bootstrap

Bootstrap a GCP project for Nomos federation. Creates a Workload Identity
Federation pool + provider, plus a service account the federated identity
impersonates.

> Final home: `github.com/auto-nomos/terraform-google-nomos-bootstrap`.

## Usage

```hcl
module "nomos" {
  source  = "github.com/auto-nomos/terraform-google-nomos-bootstrap"
  version = "0.1.0"

  customer_id = "your-nomos-customer-uuid"
  project_id  = "my-gcp-project"
}

output "nomos_paste_into_dashboard" {
  value = {
    wif_provider          = module.nomos.wif_provider
    service_account_email = module.nomos.service_account_email
    project_id            = module.nomos.project_id
  }
}
```

## What it creates

| Resource | Purpose |
|---|---|
| `google_iam_workload_identity_pool.nomos` | The WIF pool. |
| `google_iam_workload_identity_pool_provider.nomos` | OIDC provider with `attribute.customer == "{id}"` condition. |
| `google_service_account.nomos` | SA the WIF principal impersonates. Granted `roles/viewer` by default. |
| `google_service_account_iam_member.wif_impersonation` | Allows the federated identity to call `iamcredentials.googleapis.com:generateAccessToken` on the SA. |

## Federation flow

1. Nomos mints OIDC ID token with `aud=//iam.googleapis.com/<wif-provider>`, `sub=customer/{id}/agent/{agent_id}`.
2. PDP POSTs to `sts.googleapis.com:token` for a federated access token.
3. PDP POSTs to `iamcredentials.googleapis.com:projects/-/serviceAccounts/{sa-email}:generateAccessToken` impersonating the SA.
4. Returned token is a Bearer for `*.googleapis.com`.

## Limits

- WIF attribute condition pins the federation to `customer == {id}` — cross-customer cred sharing impossible.
- Default SA role is `roles/viewer`. Narrow via `service_account_roles` for production.
- `iam.serviceAccountTokenCreator` on the SA is granted to itself so the impersonation hop works without extra plumbing.
