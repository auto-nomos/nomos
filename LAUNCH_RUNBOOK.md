# Nomos Launch Runbook

Operator-executed steps to take Nomos live as **both** the hosted product
(`app.auto-nomos.com`) **and** a public OSS repo. The code prep (URL fixes,
LICENSE/governance, DX fixes, biome-green, landing flip) is already on the
`launch/oss-hardening-and-dx` branch — this runbook covers the privileged ops
only you can run.

**Legend:** 🔒 irreversible · ⏱ ordering-sensitive · ♻️ idempotent (safe to re-run)

> Do the whole thing on a low-traffic window. The critical path to a working
> public URL is: **merge branch → VM deploy → DNS resolves → certbot SSL →
> smoke**. The OSS flip is a parallel track gated only on the branch being
> merged + CI green + gitleaks clean.

---

## 0. Pre-merge gate (local, ♻️)

```bash
git checkout launch/oss-hardening-and-dx
pnpm install --frozen-lockfile
pnpm verify          # typecheck + biome + extractor/parity audits + tests — must be green
pnpm build           # full turbo build (catches dashboard breakage Vercel would hit)
pnpm test:packs      # every publishable tarball packs with dist/ + rewritten workspace:* — required before npm publish
gitleaks detect --no-banner -c .gitleaks.toml --log-opts="--all"   # history clean (0 leaks)
```

Open the PR, get CI (`.github/workflows/ci.yml`) green, merge to `main`.

> **Org:** the repo now lives at `auto-nomos/nomos`. The Terraform modules
> are mirrored to `auto-nomos/nomos-terraforms` and the Python SDK source to
> `auto-nomos/python-packages`. All workflows, npm trusted-publisher configs,
> and `github.com/auto-nomos/...` links assume these three repos.

---

## 1. npm trusted publishers (do NOW — off the critical path, 🔒 once live)

For **each** of the 13 published `@auto-nomos/*` packages on npmjs.com →
package **Settings → Trusted Publishers → Add GitHub Actions**:

```
Repository:  auto-nomos/nomos          # must match the merged repo name exactly
Workflow:    release-npm.yml
Environment: npm-publish
```

Packages: `core, cedar, ucan, ucan-cli, crypto, shared-types, sdk, mcp-server,
adapters, schema-packs, policy-builder, audit-verify, cli`.

> Until every one is registered, the publish job fails with `ENEEDAUTH`. Do all
> 13 now so it isn't on launch-day critical path.

---

## 2. VM deploy — control plane + PDP (♻️, ⏱ needs §0 merged)

`deploy.sh` clones/pulls `https://github.com/auto-nomos/nomos.git` (fixed from
the old `agent-credential-broker` URL) into `/opt/nomos/app`.

```bash
# Generate secrets locally (never commit; never scp source — VM pulls from git):
pnpm gen-keys
pnpm gen:oidc-keys --kid nomos-issuer-$(date +%Y-%m-%d)-1     # run on your laptop

# On the VM (ssh azureuser@52.172.250.27):
sudo -u nomos git -C /opt/nomos/app pull        # per the Azure rule: git pull, not scp
sudo nano /opt/nomos/app/.env.local             # paste the secrets below, chmod 600
```

`.env.local` launch-critical values (preflight fails closed if any is a dev default):

| Var | Source |
|---|---|
| `DATABASE_URL` / `DATABASE_DIRECT_URL` | Neon pooled + direct URLs |
| `SECRETBOX_KEY_HEX` | `pnpm gen-keys` |
| `AUDIT_SIGNING_PRIVATE_KEY_HEX` / `AUDIT_SIGNING_PUBLIC_KEY_HEX` | `pnpm gen-keys` |
| `AUDIT_GENESIS_SECRET` | random ≥16 chars (same value on CP + PDP) |
| `OAUTH_GITHUB_CLIENT_ID` / `_SECRET` | GitHub OAuth app |
| `R2_AUDIT_ENDPOINT` / `_BUCKET` / `_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` | Cloudflare R2 |
| `OIDC_DEV_RSA_PRIVATE_KEY_PEM` / `OIDC_DEV_KID` / `OIDC_DEV_RSA_PUBLIC_JWK` | `pnpm gen:oidc-keys` |
| `CONTROL_PLANE_PUBLIC_URL` | `http://52.172.250.27` now → `https://api.auto-nomos.com` after §4 |

```bash
# On the VM:
bash /opt/nomos/app/infrastructure/scripts/preflight.sh /opt/nomos/app/.env.local   # must exit 0
bash /opt/nomos/app/infrastructure/azure/deploy.sh        # build:server, migrate, systemd restart
curl -fsS http://127.0.0.1:8788/healthz && curl -fsS http://127.0.0.1:8787/healthz  # both {"ok":true}
```

> Never run `pnpm -r build` on the VM (OOMs next-build). `deploy.sh` uses
> `pnpm build:server` — the 14-package server subset only.

---

## 3. DNS verify (⏱ must be correct before §4)

Per `infrastructure/azure/dns.md`:

| Host | Record | Value | Proxy |
|---|---|---|---|
| `api.auto-nomos.com` | A | `52.172.250.27` | **DNS-only** |
| `pdp.auto-nomos.com` | A | `52.172.250.27` | **DNS-only** |
| `id.auto-nomos.com` | A | `52.172.250.27` | **DNS-only** (STS fetches `/jwks.json` directly — never proxy) |
| `app.auto-nomos.com` | CNAME | Vercel | proxied |

```bash
for h in api pdp id; do dig +short $h.auto-nomos.com; done   # all three → 52.172.250.27
```

---

## 4. SSL — certbot (♻️ renews in place, ⏱ DNS must resolve first 🔒-ish rate limit)

```bash
# On the VM — NSG must allow 80 + 443:
bash /opt/nomos/app/infrastructure/azure/setup-ssl.sh   # one cert for api+pdp+id, rewrites nginx + redirect + renewal timer
# Then flip the public URL and restart:
sudo sed -i 's#^CONTROL_PLANE_PUBLIC_URL=.*#CONTROL_PLANE_PUBLIC_URL=https://api.auto-nomos.com#' /opt/nomos/app/.env.local
sudo systemctl restart nomos-control-plane nomos-pdp nginx
curl -fsS https://api.auto-nomos.com/healthz && curl -fsS https://pdp.auto-nomos.com/healthz
```

> ⚠️ Let's Encrypt allows ~5 duplicate-cert failures/week. If DNS isn't pointing
> at the VM (§3), HTTP-01 fails and burns the quota. Verify DNS first.

---

## 5. Dashboard — Vercel (♻️)

Deploy `apps/dashboard` with the landing band-9 already flipped to "live" in the
branch. To avoid 404s on "view source" / star links, deploy **after** §7 (repo
public) — or deploy now and let those links resolve once §7 lands the same day.

```bash
cd apps/dashboard
vercel link            # one-time
vercel env add NEXT_PUBLIC_CONTROL_PLANE_URL production   # https://api.auto-nomos.com
vercel env add NEXT_PUBLIC_PDP_URL production             # https://pdp.auto-nomos.com
vercel env add BETTER_AUTH_SECRET production              # rotated per env
vercel env add BETTER_AUTH_URL production                 # https://app.auto-nomos.com
vercel env add DATABASE_URL production                    # Neon pooled (server-side only)
vercel domains add app.auto-nomos.com                     # CNAME already in DNS
vercel deploy --prod
```

Set the GitHub OAuth app's callback to `https://api.auto-nomos.com/...` (and any
other provider callbacks) before the first hosted sign-in.

---

## 6. npm publish (🔒 versions are permanent)

```bash
pnpm test:packs                       # green
git tag npm-v0.1.0 && git push origin npm-v0.1.0    # triggers release-npm.yml (OIDC + provenance, --access public)
```

Optional independent releases:
- `git tag pdp-v0.1.0 && git push origin pdp-v0.1.0` → cosign-signed GHCR PDP image (`release-pdp-image.yml`).
- `git tag py-v0.1.0 && git push origin py-v0.1.0` → PyPI Python SDK (`release-python.yml`).

> Optional first: bump `@auto-nomos/cli` 0.0.3 → align with `sdk` 0.1.x (cosmetic).

---

## 7. Flip repos public (🔒 IRREVERSIBLE — history is public forever)

Only after §0 merged + CI green + gitleaks history clean.

```bash
gh repo edit auto-nomos/nomos --visibility public --accept-visibility-change-consequences
gh repo edit auto-nomos/nomos-terraforms --visibility public --accept-visibility-change-consequences
```

> ⚠️ **Do not forget `nomos-terraforms`.** The self-host Terraform docs and the
> cloud-connect pages reference it; if it stays private, every self-hoster's
> `terraform init` 404s. (You chose to keep it a separate repo — it must flip too.)

Then enable: GitHub Discussions, Issues (templates ship in `.github/ISSUE_TEMPLATE/`),
and private vulnerability reporting (Settings → Security).

---

## 8. Post-deploy smoke + canary

```bash
PDP_URL=https://pdp.auto-nomos.com \
CONTROL_PLANE_URL=https://api.auto-nomos.com \
  pnpm test:smoke            # 5 contract checks (healthz ×2, authorize/proxy deny SHAPE, schema freshness)

# The schema-freshness check fails with `unknown_command` if the PDP build is
# stale — if so, re-run §2 deploy.sh and re-smoke.

npx -y @auto-nomos/mcp-server@latest --validate    # exits 0 once a real API key + URLs are set
```

Then browser-canary the golden path on `app.auto-nomos.com`: sign up → connect a
provider → create an App → issue a key (try the new **download config** button) →
first proxied call → see the audit receipt.

---

## Launch-day risk checklist

- [ ] `deploy.sh` clones `nomos.git` (not the dead `agent-credential-broker`) — fixed in branch, confirm on VM.
- [ ] `nomos-terraforms` flipped public alongside the main repo.
- [ ] DNS for api/pdp/id resolves to the VM **before** certbot (rate-limit guard).
- [ ] All 13 packages registered as npm trusted publishers (no partial publish).
- [ ] `.venv-dogfood/` gitignored + gitleaks history clean before the public flip.
- [ ] PDP smoke returns no `unknown_command` (proves the VM rebuilt with latest schema-packs).
