# Credential Broker — User Guide

## What this product is, in one sentence

**An auth gateway for API calls.** You point your code at us; we decide whether to allow each call, borrow the right SaaS token, and proxy the call on your behalf — with everything logged.

We do not run your software. We do not host AI models. We sit *between* your code (whatever runs it — Claude Desktop, Cursor MCP, your Python script, an n8n workflow, anything) and the SaaS APIs you want it to call.

```
[ your running code ]                     ← runs anywhere you want
        │  uses our SDK + API key
        ▼
[ Credential Broker SDK → PDP ]           ← us
        │  Cedar policy + capability + step-up
        ▼  if allow:
[ borrow user's encrypted token ]         ← us
        │
        ▼
[ proxy real call to GitHub / Slack / Drive / Notion / … ]
        │
        ▼
[ audit row, hash-chained, signed daily ] ← us
```

Key property: **your code never holds the SaaS token.** The end user authorizes once via OAuth in our dashboard. We keep an encrypted refresh token. We swap it for a fresh access token only when policy allows, and proxy the call.

---

## Vocabulary (new — use these terms in product, code comments, and conversations)

| Term | What it means | Was previously called |
|---|---|---|
| **App** | A credential slot for one piece of code that calls our PDP. Has a stable DID + API key. NOT the running code itself — the code is whatever you operate (Claude/Cursor/script). One App per piece of code that needs distinct policies or audit trail. | "Agent" |
| **Authorization grant** | A short-lived signed capability bound to (App, command, OAuth grant). Minted on demand. Under the hood it's a UCAN. | "UCAN" |
| **Connected account** | A user's OAuth link to a SaaS (e.g. GitHub admin-brickexchange). Stores the encrypted refresh token. | "OAuth connection" |
| **Policy** | Cedar text saying which `(App → command → resource)` triples are permitted, with conditions. Multiple per workspace. | (unchanged) |
| **Workspace** | Your tenant. One per signup. Owns Apps, policies, connected accounts, audit. | "Customer" (in DB) |
| **PDP** | Policy Decision Point. The runtime that checks grant + policy + revocation list, then proxies. | (unchanged) |
| **Audit event** | One row per decision. Hash-chained → tampering detectable. | (unchanged) |

> Internal note: the database tables, tRPC procedures, and SDK exports still use the old names (`agents`, `ucan_issues`, `oauth_connections`, `customers`). The dashboard, docs, and onboarding copy use the new names. A versioned API rename is queued for after Phase 1.

Your earlier confusion — *"create agent but it should be to any generic agent of anyone"* — was the old vocabulary's fault. **App** is the credential, not the runtime. Any external runtime can authenticate AS an App and call us.

---

## Are policies dynamic? Yes — Cedar is far more than `permit(*, *, *)`

You wrote: *"no one writes one policy, has to be dynamic right"* — correct.

### 1. Conditions on resource attributes

```cedar
permit(
  principal,
  action == Action::"/github/issue/create",
  resource
) when {
  resource.repo == "acme/billing"
};
```

### 2. Conditions on context (time, IP, user attributes injected at mint time)

```cedar
permit(
  principal,
  action == Action::"/stripe/charge",
  resource
) when {
  context.amount <= 100 ||
  (context.amount <= 1000 && context.user.role == "manager")
};

forbid(
  principal,
  action,
  resource
) when {
  context.time.hour < 9 || context.time.hour > 18  // out of business hours
};
```

`context.user.*` values come from `meta.context_hints` stamped into the grant at mint time (issuer-vouched, App can't forge). `context.time.*` and `context.ip.*` are computed at the PDP per request.

### 3. Step-up required for risky actions

```cedar
forbid(
  principal,
  action == Action::"/stripe/refund",
  resource
) unless {
  context.cosigner_present == true   // requires passkey approval on phone
};
```

The PDP returns `requiresStepUp` → user gets a Knock push → taps approve with FaceID → SDK retries → allowed.

### 4. Multiple policies per workspace

You can have:
- `allow-issues-billing.cedar` — write to one repo
- `allow-prs-readonly.cedar` — read PRs everywhere
- `forbid-after-hours.cedar` — global forbid based on time
- `step-up-large-spend.cedar` — step-up over $100

PDP evaluates ALL of them per request. **Forbid wins** if both permit and forbid match.

### 5. Templates (Sprint 7 shipped 20)

`packages/schema-packs/<integration>/templates/*` — read-only, time-bounded, step-up-write, etc. Your dashboard "New policy" wizard pulls from these so non-technical users can pick a template instead of writing Cedar.

### 6. Edit policies live

Save a policy in the dashboard → control plane re-signs the bundle → all PDPs refresh within 60s (or instantly via push). No deploy. Roll back by reverting the text.

---

## Quick tour of the dashboard (`http://localhost:3000`)

| Route | What you do here |
|---|---|
| `/sign-up` | Create your workspace + first user. |
| `/onboarding` | 3-step wizard: connect SaaS → register App → write starter policy. |
| `/app/agents` | List + register + delete Apps. Click an App to reveal its API key (one time). |
| `/app/agents/:id` | API key reveal, attached policies, recent audit. |
| `/app/policies` | List policies. |
| `/app/policies/new` | Create from blank or template. |
| `/app/policies/:id` | Edit Cedar (Monaco editor, live validation). Visual builder pending refactor. |
| `/app/audit` | Filterable audit log. Click a row → full request/decision/proof. |

> Note: the URLs still say `/app/agents/...` even though the UI now says "App." DB column rename is queued for after Phase 1; URLs follow the rename then.

---

## How to test the platform end-to-end (right now)

You already connected GitHub, Slack, Google, Notion. Let's prove the wedge with a real GitHub call.

### One-time setup (you've done step 1+2)

1. **Register App** — `/app/agents/new` → name `demo-bot`. *(Already done — `demo-bot` lives in DB.)*
2. **Create policy** — `/app/policies/new` →
   ```
   permit(principal, action == Action::"/github/user/read", resource);
   ```
   *(Already done — `allow-github-user-read` lives in DB.)*
3. **Restart the PDP** so it picks up `PDP_CUSTOMER_IDS=27d49855-9907-4db1-8a05-3239e45d7354` from `.env.local`. In the terminal where you ran the PDP: `Ctrl+C`, then re-run the dev script.

### Run the demo

```bash
pnpm tsx --env-file=.env.local scripts/demo-real-github.mts
```

Expected output:

```
demo state:
  customer:           27d49855-...
  agent:              496aefa2-... (demo-bot)
  github connection:  50deaaaf-... (admin-brickexchange)

minted UCAN bafyrei...

→ PDP /v1/proxy/github/user/read (real GitHub call)
  ✓ allow + upstream 200
  ✓ GitHub returned login=admin-brickexchange id=...
  ✓ App never saw OAuth token — PDP proxied

→ PDP /v1/proxy/github/admin/secret (should be denied by policy)
  ✓ denied — reason=policy_no_permit

→ recent audit rows (proves every decision is logged + hash-chained):
  2026-05-10T...  allow  /github/user/read
  2026-05-10T...  deny   /github/admin/secret
```

### What you just proved

1. The script == "any external runtime authenticating as the App." Replace it with whatever code you actually run.
2. The first call **succeeded against real GitHub** — the script never had a token, the PDP borrowed it.
3. The second call was **denied by policy** before any HTTP traffic to GitHub. Saved the call.
4. Both decisions are in `audit_events`. View at `/app/audit` in the dashboard.

### Next things to try

- Swap the policy in the dashboard to **forbid `/github/user/read`** → re-run script → first call now denies.
- Add a Slack policy + a Slack-mode demo (similar shape, hits `api.slack.com`).
- Walk a friend through `/onboarding` to see the user-facing flow.

---

## Where to look when something breaks

| Symptom | Where to look |
|---|---|
| Dashboard 500 / build error | apps/dashboard terminal output. Reload after fixes. |
| `policy_not_loaded` from PDP | `PDP_CUSTOMER_IDS` env, restart PDP. |
| `oauth_connection_not_found` at mint | `oauth_connections` row, customer match. |
| `oauth_token_invalid` at proxy | refresh token expired → reconnect via `/onboarding`. |
| Audit chain verification fails | `pnpm exec audit-verify --bundle audit-export.json --pubkey $AUDIT_VERIFY_KEY` |

---

## What's done vs not (Phase 1)

- Done (Sprints 1–9): foundations, PDP, control plane, SDK, OAuth bridge for 4 connectors, dashboard MVP, visual builder package, push revocation, signed audit chain, Cloudflare R2 archive, step-up + passkey PWA.
- Next (Sprint 10): six more schema packs (Salesforce, Linear, Stripe, Postgres, Jira, Calendar) + 50 more templates.
- Sprint 11: production cloud deploy, Stripe billing, npm publish, Mintlify docs site.

The plan lives at `~/.claude/plans/wobbly-discovering-pascal.md`.
