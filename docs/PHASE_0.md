# Phase 0 — pre-flight account setup

Before Sprint 3 can run end-to-end, the following external accounts must be set up. Tier 1 blocks Sprint 3. Tier 2/3 can be deferred to the sprint that needs them.

**As you complete each step, copy the relevant value into `.env.local` (a copy of `.env.example`).**

---

## Tier 1 — required before Sprint 3

### 0.1 Neon Postgres (~5 min)

1. Sign up at https://console.neon.tech (free tier is fine — 0.25 vCPU + 1 GiB storage).
2. Create project:
   - Name: `agent-auth`
   - Region: `aws-us-east-2` (matches Fly's `iad` for low latency)
   - Postgres version: 17
3. Enable database branching (default on; verify under Project settings → Branches).
4. Copy the pooled connection string from "Connection details" → set as `DATABASE_URL` in `.env.local`.
5. Copy the direct (non-pooled) connection string → set as `DATABASE_DIRECT_URL` (used by Drizzle Kit for migrations).

**Verify:**
```bash
psql "$DATABASE_URL" -c "select version();"
# should print PostgreSQL 17.x
```

### 0.2 Fly.io (~10 min)

1. Sign up at https://fly.io (no credit card needed for hobby tier).
2. Install the CLI:
   ```bash
   brew install flyctl  # or curl -L https://fly.io/install.sh | sh
   ```
3. Authenticate:
   ```bash
   fly auth login
   ```
4. Create the PDP app:
   ```bash
   fly apps create cb-pdp-dev --org personal
   ```
5. (Optional) Set a payment method — required only when scaling past hobby allotment.

**Verify:**
```bash
fly auth whoami
# prints your email
```

**First deploy** (after Neon is ready and `.env.local` is populated):
```bash
fly secrets set --app cb-pdp-dev \
  CONTROL_PLANE_URL=http://localhost:8788 \
  CONTROL_PLANE_SERVICE_TOKEN=dev-shared-token \
  AUDIT_LOG_PATH=/tmp/audit.log
fly deploy --config infrastructure/fly/pdp.toml --remote-only
```

---

## Tier 2 — Sprint 3 enrichment (optional, can be deferred)

### 0.4 WorkOS (~10 min)

If you want SSO + SCIM in Sprint 3, set this up. Otherwise Better-Auth alone supports email/password — you can come back to this later.

1. Sign up at https://workos.com (free up to 1M users).
2. Create an Organization → grab API key from Dashboard → API Keys.
3. Set `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_REDIRECT_URI` in `.env.local`.

### 0.8 Sentry (~5 min)

The PDP runs fine without Sentry (init is no-op). Set up when you want runtime error capture.

1. Sign up at https://sentry.io (free tier covers Phase 1).
2. Create project: platform = Node.js.
3. Copy DSN → set as `SENTRY_DSN` in `.env.local`.

---

## Tier 3 — defer until the relevant sprint

Each of these is needed by exactly one upcoming sprint. Set up the week before that sprint starts.

| Sprint | Service | Setup time |
|---|---|---|
| 5 | GitHub OAuth app | 5 min — https://github.com/settings/developers |
| 5 | Slack workspace + app | 15 min — https://api.slack.com/apps |
| 6 | Vercel | 5 min — https://vercel.com (link via `vercel link` from `apps/dashboard`) |
| 6/11 | Resend | 10 min — https://resend.com (verify sending domain) |
| 8 | AWS + S3 bucket `cb-audit-archive-dev` | 15 min — IAM user with bucket-scoped access only |
| 9 | Knock | 5 min — https://knock.app |
| 11 | Stripe (test mode) + Stripe Tax | 15 min — https://dashboard.stripe.com |

---

## Secret hygiene

- Use a password manager (1Password recommended) to sync `.env.local` across machines.
- Never commit `.env.local` (it is in `.gitignore`).
- Rotate any secret that lands in a Slack/email/screenshot.
- For Fly app secrets, use `fly secrets set` — the values are stored encrypted; never put live secrets in `pdp.toml`'s `[env]` table.

---

## When you're done with Tier 1

Reply "Tier 1 done" and I'll resume Sprint 3 — Drizzle schema + tRPC scaffolding + Better-Auth integration + signed policy bundle delivery to PDP.
