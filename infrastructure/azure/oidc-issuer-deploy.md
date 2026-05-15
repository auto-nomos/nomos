# Deploy OIDC issuer at id.auto-nomos.com (Azure VM)

End-to-end runbook to stand up the Nomos OIDC issuer on the existing
`nomos-vm` (52.172.250.27, centralindia). After this, AWS STS / Azure AD /
GCP STS can validate cloud-IAM ID tokens that the control-plane mints.

**Architecture (preview):** no Cloudflare Worker. The control-plane already
serves `GET /.well-known/openid-configuration` and `GET /oidc/jwks.json`
when an OIDC signer is configured. nginx fronts the VM, exposes only
those two paths under `id.auto-nomos.com`, and rewrites `/jwks.json` →
`/oidc/jwks.json`. Edge caching can move to Cloudflare Workers later
without changing the control-plane.

## 0. Pre-flight (local)

You should be on the repo at HEAD of `main` with the cloud-IAM bits
landed (migration `0028_cloud_iam_m0`, `apps/control-plane/src/routes/oidc.ts`,
the nginx changes from this PR). Verify:

```sh
git fetch origin && git log --oneline origin/main | head -5
ls apps/control-plane/db/migrations/0028_cloud_iam_m0.sql
grep "id.auto-nomos.com" infrastructure/azure/nginx.conf
```

## 1. Generate the RS256 keypair

The issuer signs JWTs with RS256. AWS STS + Azure AD + GCP STS all require
RSA (they reject EdDSA), so this key is separate from the Ed25519 keys
used for bundle signing.

```sh
pnpm gen:oidc-keys --kid nomos-issuer-$(date +%Y-%m-%d)-1 > /tmp/oidc-env-block.env
```

The file `/tmp/oidc-env-block.env` now contains an env-var block with:

- `OIDC_ISSUER_URL=https://id.auto-nomos.com`
- `OIDC_ID_TOKEN_TTL_SECONDS=300`
- `OIDC_DEV_KID=...`
- `OIDC_DEV_RSA_PRIVATE_KEY_PEM='...'` (multi-line PEM, single-quoted)
- `OIDC_DEV_RSA_PUBLIC_JWK='...'` (single-line JSON)

**Do not commit this file.** The private PEM stays on your laptop until
you paste it into the VM env file in step 4.

## 2. Add DNS

In the DNS host for `auto-nomos.com` (Cloudflare per
[infrastructure/azure/dns.md](dns.md)):

| Host | Type | Value | Proxy |
| --- | --- | --- | --- |
| `id.auto-nomos.com` | A | `52.172.250.27` | **DNS-only** |

Cloudflare proxying MUST be off — certbot HTTP-01 fails when proxied, and
AWS STS fetches `/jwks.json` directly without any CDN intermediary.

Verify propagation:

```sh
dig +short id.auto-nomos.com
# expected: 52.172.250.27
```

## 3. Push code + nginx config to the VM

On your local machine, push to `main` (or merge the PR that introduces
this runbook):

```sh
git push origin main
```

Then SSH into the VM and pull:

```sh
ssh azureuser@52.172.250.27
cd /opt/nomos/app
git fetch origin && git reset --hard origin/main
```

(Never `rsync` source into `/opt/nomos/app` — see
[feedback_azure_deploy_rule.md](#).)

## 4. Append the OIDC env block to .env.local

Still SSH'd into the VM:

```sh
sudo nano /opt/nomos/app/.env.local
```

Paste the contents of `/tmp/oidc-env-block.env` (from step 1) at the
bottom of the file. The PEM is multi-line and **must** stay single-quoted:

```
OIDC_DEV_RSA_PRIVATE_KEY_PEM='-----BEGIN PRIVATE KEY-----
...several lines...
-----END PRIVATE KEY-----
'
```

Save + verify file mode:

```sh
sudo chmod 600 /opt/nomos/app/.env.local
sudo ls -l /opt/nomos/app/.env.local   # expect: -rw------- nomos nomos
```

While editing this file, also add the cloud-IAM PDP webhook
(safe-default — control-plane needs at least one webhook URL to enable
cross-process audit chaining for cloud calls):

```
PDP_WEBHOOK_URLS=http://127.0.0.1:8787/v1/internal/refresh-revocations,http://127.0.0.1:8787/v1/internal/audit/emit-cloud
```

## 5. Apply migration 0028 + rebuild

```sh
cd /opt/nomos/app
pnpm install
pnpm --filter @auto-nomos/control-plane db:migrate
pnpm build:server
```

`pnpm build:server` is the canonical build entry on the small B1s VM —
`pnpm -r build` OOMs the next-build step.

## 6. Deploy the updated nginx config

```sh
sudo cp /opt/nomos/app/infrastructure/azure/nginx.conf /etc/nginx/sites-available/nomos
sudo nginx -t                       # syntax-check before reload
sudo systemctl reload nginx
```

At this point port 80 on `id.auto-nomos.com` is wired but TLS is not yet.

## 7. Issue TLS for id.auto-nomos.com

Run the bundled SSL setup script — it idempotently re-issues for all
three hostnames (api/pdp/id) and edits the nginx config in place to add
443 server blocks + the http→https redirect:

```sh
sudo bash /opt/nomos/app/infrastructure/azure/setup-ssl.sh
```

If you previously ran setup-ssl.sh with only api+pdp, this run will
expand the cert to also cover `id.auto-nomos.com`.

## 8. Restart the control plane

```sh
sudo systemctl restart nomos-control-plane
sudo journalctl -u nomos-control-plane -n 30 --no-pager
```

Look for the line `oidc issuer signer loaded` with your `kid`. If it
warns `OIDC issuer signing key not configured`, the env block didn't
load — re-check `.env.local` (single quotes, no leading spaces).

## 9. Smoke-test the public surface

From any host:

```sh
# Discovery doc
curl -fsS https://id.auto-nomos.com/.well-known/openid-configuration | jq

# JWKS — must include your kid + alg=RS256
curl -fsS https://id.auto-nomos.com/jwks.json | jq '.keys[] | {kid, kty, alg, use}'

# Healthz (nginx-served, doesn't hit control-plane)
curl -fsS https://id.auto-nomos.com/healthz
# → ok

# 404 for every other path (defensive — control-plane internals stay
# unreachable through this hostname)
curl -sS -o /dev/null -w "%{http_code}\n" https://id.auto-nomos.com/v1/authorize
# → 404
```

Expected discovery body:

```json
{
  "issuer": "https://id.auto-nomos.com",
  "jwks_uri": "https://id.auto-nomos.com/jwks.json",
  "response_types_supported": ["id_token"],
  "subject_types_supported": ["public"],
  "id_token_signing_alg_values_supported": ["RS256"],
  "claims_supported": ["iss","sub","aud","iat","exp","nbf","jti"]
}
```

## 10. End-to-end probe via PDP

Confirms the internal mint + JWKS publish + RS256 verify all line up.
Run on the VM (it needs `CONTROL_PLANE_SERVICE_TOKEN` from `.env.local`):

```sh
# Pull the service token
TOK=$(grep -E '^CONTROL_PLANE_SERVICE_TOKEN=' /opt/nomos/app/.env.local | cut -d= -f2-)

# Mint a token via the internal endpoint
curl -fsS -X POST https://api.auto-nomos.com/v1/internal/oidc/mint-id-token \
  -H "authorization: Bearer $TOK" \
  -H "content-type: application/json" \
  -d '{
    "customer_id": "00000000-0000-0000-0000-000000000001",
    "agent_id":    "00000000-0000-0000-0000-000000000002",
    "audience":    "api://AzureADTokenExchange",
    "ttl_seconds": 300
  }' | jq

# Verify it offline against the public JWKS
TOKEN=$(curl -fsS -X POST https://api.auto-nomos.com/v1/internal/oidc/mint-id-token \
  -H "authorization: Bearer $TOK" -H "content-type: application/json" \
  -d '{"customer_id":"c1","agent_id":"a1","audience":"api://AzureADTokenExchange"}' | jq -r .token)

JWKS=$(curl -fsS https://id.auto-nomos.com/jwks.json)
echo "$JWKS" | jq -r '.keys[0].kid'
echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq
```

`iss` should be `https://id.auto-nomos.com`, `aud` the value you passed,
and `kid` (in the JWT header — `echo "$TOKEN" | cut -d. -f1 | base64 -d`)
must equal the one in the JWKS response.

## 11. Wire customers to the issuer

Customers running the per-cloud Terraform modules
(`infra/terraform/{aws,azurerm,google}-nomos-bootstrap`) set the
`nomos_oidc_issuer` variable to `https://id.auto-nomos.com`. The dashboard
`/app/cloud/connect/<cloud>` wizards already reference this URL in the
`tfvars` snippet they emit.

The in-app guide at `/app/guide/cloud` Step 1 should now have the green
"issuer reachable" badge instead of the amber preview banner. (If you
keep the banner — update `apps/dashboard/src/components/nomos/guide.tsx`
to flip the badge once you confirm steps 9 + 10 pass in prod.)

## Rotation (later)

```sh
# 1. Generate next key with status=next
pnpm gen:oidc-keys --kid nomos-issuer-$(date +%Y-%m-%d)-2 > /tmp/oidc-next.env

# 2. Append, then mark active when ready
sudo nano /opt/nomos/app/.env.local       # set OIDC_DEV_KID + JWK + PEM to new values
sudo systemctl restart nomos-control-plane

# 3. Keep the old key in oidc_issuer_keys with status=retired for the
#    28d overlap window so previously-minted tokens still verify against
#    the JWKS while their TTL drains (default TTL is 5min, so practically
#    overlap of 1h is enough — 28d is the safety floor).
```

The `oidc_issuer_keys` table publishes `active + next + retired (within
overlap)` to JWKS, so STS always sees at least one matching kid.

## Future hardening (out of scope for preview)

- **AWS KMS signer.** Move the private key off-disk. Set
  `OIDC_KMS_KEY_ARN` to an `RSA_2048` / `RSASSA_PKCS1_V1_5_SHA_256` key;
  keep `OIDC_DEV_RSA_PUBLIC_JWK` for what gets served at `/jwks.json`
  (derive from `aws kms get-public-key`).
- **Cloudflare Worker.** `apps/oidc-issuer/` is a Worker that proxies
  the same two paths with `cf-cache` for DDoS posture. Deploy with
  `npx wrangler deploy` once Cloudflare access is set up; point
  `CONTROL_PLANE_PUBLIC_URL` in `wrangler.toml` at
  `https://api.auto-nomos.com` and switch the DNS record for
  `id.auto-nomos.com` to the Worker route.
- **Multi-region failover.** The current VM is the single point of
  failure. Once a second region is up, put both behind a Cloudflare
  Worker route with regional-fallback `fetch`es.
