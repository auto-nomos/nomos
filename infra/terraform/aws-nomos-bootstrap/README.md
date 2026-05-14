# terraform-aws-nomos-bootstrap

Bootstrap an AWS account to trust the Nomos OIDC issuer.

> Final home: `github.com/auto-nomos/terraform-aws-nomos-bootstrap`. Mirrored
> from this monorepo path until first release tag.

## Usage

```hcl
module "nomos" {
  source  = "github.com/auto-nomos/terraform-aws-nomos-bootstrap"
  version = "0.1.0"

  customer_id = "your-nomos-customer-uuid"
  region      = "us-east-1"
}

output "nomos_paste_into_dashboard" {
  value = {
    role_arn   = module.nomos.role_arn
    account_id = module.nomos.account_id
    region     = module.nomos.region
  }
}
```

## What it creates

| Resource | Purpose |
|---|---|
| `aws_iam_openid_connect_provider.nomos` | IAM OIDC provider trusting `id.auto-nomos.com`. |
| `aws_iam_role.nomos` | Role with trust policy keyed on `sub = customer/{id}/agent/*` and `aud = sts.amazonaws.com`. |
| `aws_iam_role_policy_attachment` | Defaults to `arn:aws:iam::aws:policy/ReadOnlyAccess` — narrow via `managed_policy_arns` / `additional_policy_json`. |

## Federation flow

1. Nomos mints OIDC ID token (RS256, AWS KMS) with `aud=sts.amazonaws.com`, `sub=customer/{id}/agent/{agent_id}`.
2. PDP POSTs to `sts.{region}.amazonaws.com` with `Action=AssumeRoleWithWebIdentity`, `RoleArn=<role-arn>`, `WebIdentityToken=<id-token>`.
3. STS returns short-lived AccessKey + SecretKey + SessionToken (~1hr).
4. PDP signs subsequent service calls with SigV4 using the credentials.

## Limits

- Regional STS endpoints recommended over the global one (latency + outage isolation). Default region is `us-east-1`; change via `var.region`.
- GovCloud needs a separate Terraform variant (uses `sts.{gov-region}.amazonaws.com`).
- The default ReadOnlyAccess managed policy covers the AWS schema-pack reads + most ops actions short of `iam:*`/`s3:Delete*` etc. Narrow further with `additional_policy_json` for production.
