# terraform-aws-nomos-bootstrap

Bootstrap an AWS account to trust the Nomos OIDC issuer. Creates an IAM
OIDC provider + IAM role with `sts:AssumeRoleWithWebIdentity` trust so the
Nomos PDP can exchange a fresh ID token for short-lived STS credentials per
agent request.

> **End-to-end walkthrough with screenshots:**
> [docs.auto-nomos.com/providers/cloud-aws](https://app.auto-nomos.com/docs/providers/cloud-aws)

> **Preview (2026-05-15):** no public mirror yet. Source this module from a
> local path that points at `infra/terraform/aws-nomos-bootstrap/` in the
> Nomos repo, or copy the directory into your own Terraform repo and pin to
> a commit SHA. The CLI emits a working snippet automatically:
> `nomos cloud install --aws --customer-id <id> --nomos-oidc-issuer <url>`.

## Before you start

- AWS account with IAM admin access.
- `aws configure` completed (Terraform reuses CLI auth).
- Terraform 1.5+ with the `aws` provider.
- Your Nomos `customer_id` from `/app/settings/organization`.

## Usage

```hcl
module "nomos" {
  # Preview: local-path source. Adjust the relative path to wherever
  # you cloned the credential-broker repo.
  source = "../credential-broker/infra/terraform/aws-nomos-bootstrap"

  customer_id       = "your-nomos-customer-uuid"      # from /app/settings/workspace
  region            = "us-east-1"
  nomos_oidc_issuer = "https://<your-issuer-host>"    # URL of the OIDC issuer you deployed
                                                      # (see apps/oidc-issuer/)
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

1. Nomos mints OIDC ID token (RS256) with `aud=sts.amazonaws.com`, `sub=customer/{id}/agent/{agent_id}`, signed by either the dev in-memory signer or AWS KMS when `OIDC_KMS_KEY_REF` is set on the control plane.
2. PDP POSTs to `sts.{region}.amazonaws.com` with `Action=AssumeRoleWithWebIdentity`, `RoleArn=<role-arn>`, `WebIdentityToken=<id-token>`.
3. STS returns short-lived AccessKey + SecretKey + SessionToken (~1hr).
4. PDP signs subsequent service calls with SigV4 using the credentials.

## Verify

After `terraform apply`:

1. Dashboard → `/app/cloud/connect/aws` → paste `role_arn` → **Test**.
2. Dashboard does an `AssumeRoleWithWebIdentity` round trip + a no-op API call.
3. Green check = federation works.

Smoke-test from CLI:

```bash
aws sts assume-role-with-web-identity \
  --role-arn "$(terraform output -raw role_arn)" \
  --role-session-name nomos-smoke \
  --web-identity-token "<assertion-jwt-from-nomos-issuer>"
```

## Limits

- Regional STS endpoints recommended over the global one (latency + outage isolation). Default region is `us-east-1`; change via `var.region`.
- GovCloud needs a separate Terraform variant (uses `sts.{gov-region}.amazonaws.com`).
- The default ReadOnlyAccess managed policy covers the AWS schema-pack reads + most ops actions short of `iam:*`/`s3:Delete*` etc. Narrow further with `additional_policy_json` for production.
