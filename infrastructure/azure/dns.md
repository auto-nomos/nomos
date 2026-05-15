# DNS plan — auto-nomos.com

Source of truth for production DNS. Update this file in the same PR as any
registrar change so the record table never drifts from reality.

## Provider

- Registrar: GoDaddy (auto-renew enabled until 2027-05-01)
- DNS host: Cloudflare (free tier; proxy disabled on api/pdp, enabled on
  apex and `app`)

## Record table

| Host | Type | Value | Proxy | Notes |
| --- | --- | --- | --- | --- |
| `auto-nomos.com` | A | 76.76.21.21 | proxied | Vercel apex; redirects to `app.` |
| `www.auto-nomos.com` | CNAME | `cname.vercel-dns.com.` | proxied | Marketing site |
| `app.auto-nomos.com` | CNAME | `cname.vercel-dns.com.` | proxied | Dashboard (Next.js on Vercel) |
| `api.auto-nomos.com` | A | 52.172.250.27 | DNS-only | Control plane on Azure VM; TLS via certbot |
| `pdp.auto-nomos.com` | A | 52.172.250.27 | DNS-only | PDP on Azure VM; TLS via certbot |
| `id.auto-nomos.com` | A | 52.172.250.27 | DNS-only | OIDC issuer (cloud federation); TLS via certbot. Must NOT be proxied — AWS STS / Azure AD / GCP STS fetch `/jwks.json` directly. |
| `_acme-challenge.api` | TXT | (dynamic) | DNS-only | Only present mid-issuance |

api/pdp are NOT proxied through Cloudflare — certbot's HTTP-01 challenge
fails when proxying is on. If you need DDoS shielding later, switch to the
DNS-01 challenge with a Cloudflare API token.

## Propagation playbook

```sh
# Verify the records before running setup-ssl.sh
for h in api pdp id app www; do
  echo "--- $h.auto-nomos.com ---"
  dig +short "$h.auto-nomos.com"
done
```

Expected output for the wedge launch:

```
--- api.auto-nomos.com ---
52.172.250.27
--- pdp.auto-nomos.com ---
52.172.250.27
--- id.auto-nomos.com ---
52.172.250.27
--- app.auto-nomos.com ---
76.76.21.21
--- www.auto-nomos.com ---
76.76.21.21
```

## Email (post-wedge)

| Host | Type | Value | Notes |
| --- | --- | --- | --- |
| `auto-nomos.com` | MX | `aspmx.l.google.com.` priority 1 | Google Workspace (deferred) |
| `auto-nomos.com` | TXT | `v=spf1 include:_spf.google.com ~all` | SPF |
| `auto-nomos.com` | TXT | `v=DMARC1; p=none; rua=mailto:dmarc@auto-nomos.com` | DMARC report-only first |

Defer Workspace + DMARC until a customer asks. The wedge uses
`admin@auto-nomos.com` via the registrar's forwarder.
