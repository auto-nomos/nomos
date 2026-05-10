# Dev environment setup — third-party services

Step-by-step bring-up of every external account required to exercise the
platform end-to-end in dev mode. Each section ends with the exact env
keys to paste into `.env.local` (control-plane) or per-app `.env.local`.

`.env.local` is gitignored — never commit secrets.

> Order matters: items in **Tier 0** are always required. **Tier 1** is
> required only for the feature listed. Everything else is optional —
> the platform has dev fallbacks for Knock, R2, Sentry, WorkOS, Stripe,
> Resend.

---

## Tier 0 — required to boot anything (15 min total)

### 0.1 Docker (Postgres)

Docker Desktop or OrbStack (preferred on Apple Silicon — lighter, faster).

```bash
brew install --cask orbstack       # or: brew install --cask docker
docker --version
docker compose version
```

Start the dev DB:

```bash
pnpm db:up                         # starts postgres:17 on host port 5433
psql 'postgres://cb:cb@localhost:5433/cb_dev' -c 'select 1'
```

Reset (drops volume): `pnpm db:reset`. Stop: `pnpm db:down`.

`.env.local`:

```
DATABASE_URL=postgres://cb:cb@localhost:5433/cb_dev
DATABASE_DIRECT_URL=postgres://cb:cb@localhost:5433/cb_dev
```

### 0.2 Local signing keys

One command generates **two keypairs**:

1. Control-plane bundle signing (Sprint 3 — PDP verifies signed policy bundles).
2. Audit root signing (Sprint 8 / D-4 — daily audit-chain root signature).

```bash
cp .env.example .env.local         # only if you haven't already
pnpm gen-keys
```

Writes (or rewrites) into `.env.local`:

```
CONTROL_PLANE_BUNDLE_SIGN_KEY=<hex>
CONTROL_PLANE_BUNDLE_VERIFY_KEY=<hex>
CONTROL_PLANE_BUNDLE_SIGN_DID=did:key:...
AUDIT_SIGN_KEY=<hex>
AUDIT_VERIFY_KEY=<hex>
AUDIT_SIGNING_KEY_ID=did:key:...
```

The PDP needs the same `CONTROL_PLANE_BUNDLE_VERIFY_KEY` value. Both
live in one root `.env.local` so all packages see them.

### 0.3 OAuth token encryption + state secret

Used by Sprint 5 OAuth bridge. The defaults in `.env.example` are
**dev-only sentinel values** — fine for local dev, **never** ship to prod.

Generate stronger ones if you want:

```bash
node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))'   # OAUTH_TOKEN_ENCRYPTION_KEY
node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))'   # OAUTH_STATE_SIGN_SECRET
```

`.env.local`:

```
OAUTH_TOKEN_ENCRYPTION_KEY=<64-hex-chars>
OAUTH_STATE_SIGN_SECRET=<32+ chars>
```

---

## Tier 1 — feature-specific external services

Each subsection covers one feature. Skip the ones you do not plan to test.

---

### 1.A Cloudflare tunnel (required for any OAuth provider in dev)

OAuth providers cannot redirect to `localhost`. The tunnel exposes
`http://localhost:8788` at a public HTTPS URL the providers can hit.

**Install** (one-time):

```bash
brew install cloudflare/cloudflare/cloudflared       # macOS
cloudflared --version
```

You have two options. Pick one and stick with it.

#### Option 1 — Quick tunnel (default, URL rotates per run)

Easiest to start. The pain: the URL changes on every restart, so all
four OAuth apps' callback URLs need updating each time, plus
`CONTROL_PLANE_PUBLIC_URL` in `.env.local`.

```bash
pnpm tunnel
# look for: https://something-something.trycloudflare.com
```

Keep the terminal open. Copy the printed URL into each OAuth provider's
callback config (1.B–1.E) and into `.env.local` as
`CONTROL_PLANE_PUBLIC_URL`.

#### Option 2 — Named tunnel (stable URL, ~10min one-time setup)

Recommended once you've connected more than one OAuth provider — the
URL never changes, so callback configs stay valid across restarts.
Requires a domain on Cloudflare (free Cloudflare account works; Workers
trial domains do **not** support tunnel DNS).

```bash
# 1. Authenticate (opens browser; pick the zone that owns your domain)
cloudflared tunnel login

# 2. Create the tunnel — a UUID + creds file land in ~/.cloudflared/
cloudflared tunnel create cb-dev

# 3. Map a hostname on your zone to the tunnel
cloudflared tunnel route dns cb-dev cb.dev.example.com
```

Write `~/.cloudflared/config.yml`:

```yaml
tunnel: cb-dev
credentials-file: /Users/me/.cloudflared/<TUNNEL_UUID>.json
ingress:
  - hostname: cb.dev.example.com
    service: http://localhost:8788
  - service: http_status:404
```

Run it:

```bash
cloudflared tunnel run cb-dev
```

Pin the hostname in `.env.local` once and never touch it again:

```
CONTROL_PLANE_PUBLIC_URL=https://cb.dev.example.com
OAUTH_NOTION_AUTHORIZATION_URL=https://api.notion.com/v1/oauth/authorize?client_id=<id>&response_type=code&owner=user&redirect_uri=https%3A%2F%2Fcb.dev.example.com%2Fv1%2Foauth%2Fcallback%2Fnotion
```

OAuth provider callbacks (1.B–1.E) get the same hostname — set them
once and they survive every restart of the broker, postgres, and the
tunnel itself.

---

### 1.B GitHub OAuth app (Sprint 5)

1. Visit: https://github.com/settings/developers → **New OAuth App**.
2. Fill in:
   - **Application name:** `cb-dev-<your-handle>`
   - **Homepage URL:** `http://localhost:3000`
   - **Authorization callback URL:** `https://<your-tunnel>.trycloudflare.com/v1/oauth/callback/github`
3. Click **Register application**.
4. Copy **Client ID**.
5. Click **Generate a new client secret** → copy the secret immediately
   (shown once).

`.env.local`:

```
OAUTH_GITHUB_CLIENT_ID=Iv1.xxxxxxxxxxxx
OAUTH_GITHUB_CLIENT_SECRET=<hex>
```

> If the tunnel URL rotates, edit the OAuth app's callback URL in
> github.com to match — saves you wondering why the callback is 404ing.

---

### 1.C Slack app (Sprint 5)

1. Visit: https://api.slack.com/apps → **Create New App** → **From scratch**.
2. Name: `cb-dev`. Workspace: pick a personal/dev workspace.
3. Sidebar → **OAuth & Permissions**:
   - Add **Redirect URL:** `https://<your-tunnel>.trycloudflare.com/v1/oauth/callback/slack` → **Save URLs**.
   - Under **Bot Token Scopes** add scopes the connector requires
     (see `apps/control-plane/src/oauth/connectors/slack.ts` for the
     authoritative list — Sprint 5 default is `chat:write,channels:read`).
4. Sidebar → **Basic Information** → copy:
   - **Client ID**
   - **Client Secret**
   - **Signing Secret** (used later for inbound Slack webhooks; pasted
     even though Sprint 5 does not consume it yet — Sprint 11+).

`.env.local`:

```
OAUTH_SLACK_CLIENT_ID=<digits>.<digits>
OAUTH_SLACK_CLIENT_SECRET=<hex>
SLACK_SIGNING_SECRET=<hex>
```

---

### 1.D Google Cloud OAuth client (Sprint 5)

1. Visit https://console.cloud.google.com/ → create or pick a project.
2. **APIs & Services → OAuth consent screen**:
   - User type: **External**, fill the minimum (app name, support email, developer email). Save.
   - Add yourself under **Test users**.
3. **APIs & Services → Credentials → + CREATE CREDENTIALS → OAuth client ID**:
   - Application type: **Web application**.
   - Name: `cb-dev`.
   - **Authorized redirect URIs:** `https://<your-tunnel>.trycloudflare.com/v1/oauth/callback/google`.
4. Save → copy **Client ID** + **Client secret**.
5. **APIs & Services → Library** — enable any Google APIs the connector
   uses (Drive, Calendar, Gmail; Sprint 5 default is Drive read scope).

`.env.local`:

```
OAUTH_GOOGLE_CLIENT_ID=<digits>-<hash>.apps.googleusercontent.com
OAUTH_GOOGLE_CLIENT_SECRET=GOCSPX-<...>
```

---

### 1.E Notion integration (Sprint 5)

Notion's OAuth flow is "public integration" mode.

1. Visit https://www.notion.so/profile/integrations → **+ New integration**.
2. **Type:** Public (OAuth). **Associated workspace:** pick yours.
3. **Redirect URIs:** `https://<your-tunnel>.trycloudflare.com/v1/oauth/callback/notion`.
4. Save → copy **OAuth client ID** + **OAuth client secret**.

`.env.local`:

```
OAUTH_NOTION_CLIENT_ID=<uuid>
OAUTH_NOTION_CLIENT_SECRET=secret_<hex>
```

> If the integration stays in "internal" mode you only get an internal
> token, not an OAuth flow. Must be **Public**.

---

### 1.F Cloudflare R2 (Sprint 8 audit archive — optional in dev)

The hourly Parquet archive worker is **disabled** when any
`R2_AUDIT_*` value is blank. Postgres still records every audit event;
R2 is the long-term immutable store. Skip this section for now if you
just want to test the live audit chain.

1. Sign up: https://dash.cloudflare.com → **R2** in the sidebar →
   **Subscribe** (free 10 GB/mo, no card required for the free tier).
2. **Create bucket:** name `cb-audit-archive-dev`, default region.
3. Find your **Account ID** (bottom-right of the R2 page, or
   dashboard URL).
4. **Manage R2 API Tokens → Create API Token**:
   - Permissions: **Object Read and Write**.
   - Specify bucket: `cb-audit-archive-dev`.
   - Click **Create API Token**.
   - Copy **Access Key ID** + **Secret Access Key** (shown once).
5. R2 endpoint URL is `https://<account-id>.r2.cloudflarestorage.com`.

`.env.local`:

```
R2_AUDIT_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_AUDIT_BUCKET=cb-audit-archive-dev
R2_AUDIT_ACCESS_KEY_ID=<from token>
R2_AUDIT_SECRET_ACCESS_KEY=<from token>
```

Optional retention rule (7 years per plan):

```bash
wrangler r2 bucket lifecycle put cb-audit-archive-dev \
  --rule infrastructure/r2/lifecycle.json
```

---

### 1.G Knock (Sprint 9 step-up push — optional)

**Dev fallback:** leave `KNOCK_API_KEY` empty. The notifier logs the
`/approve/<id>` deep link to console; open it manually to approve.

To use real push:

1. Sign up: https://dashboard.knock.app → create a workspace (no card
   for dev tier).
2. **Workflows → Create workflow** named `step-up-request`. Add a **Push**
   channel step (web push or APNs/FCM) — payload uses these data fields:
   `approvalId`, `customerId`, `agentId`, `command`, `resource`,
   `deepLink`, `ttlSeconds`. (See `memory/reference_knock_workflows.md`
   for the body shape.)
3. **Settings → Developers → API Keys** → copy the **secret** key.
4. Invite yourself as a recipient: **Users → Add user** with the same
   `id` as your Better-Auth `user.id` (find it in Postgres after sign-up:
   `select id from "user";`). For dev simplicity you can also fan out to
   email-only recipients.

`.env.local`:

```
KNOCK_API_KEY=sk_<hex>
KNOCK_WORKFLOW_ID=step-up-request
STEPUP_DEFAULT_TTL_MS=60000
DASHBOARD_PUBLIC_URL=http://localhost:3000
```

> For phone-passkey demo, set `DASHBOARD_PUBLIC_URL` to the
> cloudflared tunnel URL pointed at port `3000` and run a separate
> `pnpm tunnel` for the dashboard. WebAuthn requires HTTPS origin and
> matching `rpId`.

---

### 1.H Sentry (any sprint — optional)

1. Sign up: https://sentry.io → create project → **Platform: Node**.
2. Copy DSN from project settings.

`.env.local`:

```
SENTRY_DSN=https://<key>@<org>.ingest.sentry.io/<project-id>
SENTRY_TRACES_SAMPLE_RATE=0.1
```

Empty DSN = SDK is no-op. Always safe to leave blank.

---

## Tier 2 — only needed for Sprint 11+ deploy

Skip until you actually deploy. WorkOS, Resend, Stripe, Fly.io, Vercel,
Neon, Grafana Cloud — the plan covers each in §11.0.

---

## Verification — does my env actually work?

After populating `.env.local`:

```bash
pnpm db:up
pnpm install
pnpm gen-keys                      # only if you skipped 0.2
pnpm dev                           # starts control-plane + pdp + dashboard
```

In another terminal, sanity-check:

```bash
curl -fsS http://localhost:8788/healthz   && echo " control-plane OK"
curl -fsS http://localhost:8787/healthz   && echo " pdp OK"
open http://localhost:3000                 # dashboard
```

Run the per-sprint e2e:

```bash
pnpm e2e:sprint3                  # control-plane ↔ pdp signed bundle
pnpm e2e:sprint5                  # OAuth bridge (needs tunnel + at least one provider)
```

Workspace test sweep (no external providers required):

```bash
pnpm test
```

---

## Quick reference — env keys per feature

| Feature | Env keys | Required for dev? |
|---|---|---|
| Postgres | `DATABASE_URL`, `DATABASE_DIRECT_URL` | **yes** |
| Bundle sig + audit roots | `CONTROL_PLANE_BUNDLE_*`, `AUDIT_*` | **yes** (run `pnpm gen-keys`) |
| OAuth bridge core | `OAUTH_TOKEN_ENCRYPTION_KEY`, `OAUTH_STATE_SIGN_SECRET` | yes if testing Sprint 5+ |
| GitHub OAuth | `OAUTH_GITHUB_*` | yes for GitHub flows |
| Slack OAuth | `OAUTH_SLACK_*`, `SLACK_SIGNING_SECRET` | yes for Slack flows |
| Google OAuth | `OAUTH_GOOGLE_*` | yes for Google flows |
| Notion OAuth | `OAUTH_NOTION_*` | yes for Notion flows |
| Push revocation target | `PDP_WEBHOOK_URLS` | default `http://localhost:8787/v1/internal/refresh-revocations` |
| R2 archive | `R2_AUDIT_*` | optional (worker disabled when blank) |
| Step-up push | `KNOCK_API_KEY`, `KNOCK_WORKFLOW_ID`, `STEPUP_DEFAULT_TTL_MS`, `DASHBOARD_PUBLIC_URL` | optional (dev console fallback works) |
| Sentry | `SENTRY_DSN` | optional |

---

## Common gotchas

- **Tunnel URL rotates** per `pnpm tunnel` run. Update OAuth app
  callback URLs each time, or run a named tunnel with a Cloudflare
  account.
- **Slack scopes mismatch** = silent 200 but no upstream API access.
  Check the connector source for the scope list before adding the app.
- **Google OAuth consent in test mode** = only the listed test users
  can complete the flow. Add yourself.
- **Notion integration in internal mode** = no OAuth flow. Must be
  **Public**.
- **R2 endpoint URL** is `<account-id>.r2.cloudflarestorage.com` — no
  region segment, unlike S3.
- **Knock recipient id** must match your Better-Auth `user.id` (UUID).
  Easiest: sign up first, then run `psql ... -c 'select id, email from "user";'`
  and create the matching recipient in Knock.
- **`pnpm gen-keys` overwrites** existing keys in `.env.local` — only
  run once per environment unless you intend to rotate.
