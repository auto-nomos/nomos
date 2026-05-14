# Nomos — User Guide

> **Surface area at a glance.** Three runtime modes share one PDP, one Cedar engine, one audit chain, one observability surface:
>
> 1. **SaaS proxy** — borrow user OAuth tokens, proxy GitHub / Slack / Google / Notion / Stripe / Linear / etc. (Sprint 5–7)
> 2. **Multi-agent swarm** — parent→child UCAN delegation chains with chain-attenuation, snapshot approvals, MAOS observability (Sprint MAOS-A/B/C)
> 3. **Cloud IAM** — federated Azure / AWS / GCP via the Nomos-hosted OIDC issuer at `id.auto-nomos.com`; no stored cloud secrets (Sprint Cloud M0–M9)
>
> Same Cedar policies, same UCANs, same audit, same step-up across all three. Cloud calls appear in the swarm view next to SaaS calls. Jump to [Delegation chains](#delegation-chains--multi-agent-orchestration-security-beta) or [Cloud IAM](#cloud-iam--azure-aws-gcp-federated-no-stored-keys) below.

## What this product is, in one sentence

**An auth gateway for API calls.** You point your code at us; we decide whether to allow each call, borrow the right token (OAuth refresh OR federated cloud session), and proxy the call on your behalf — with everything logged.

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
- Done (Sprint MAOS A+B+C, beta): multi-agent delegation chains — see chapter below.
- Next (Sprint 10): six more schema packs (Salesforce, Linear, Stripe, Postgres, Jira, Calendar) + 50 more templates.
- Sprint 11: production cloud deploy, Stripe billing, npm publish, Mintlify docs site.

The plan lives at `~/.claude/plans/wobbly-discovering-pascal.md`. The MAOS plan lives at `~/.claude/plans/now-whatever-we-have-elegant-tarjan.md`.

---

## Delegation chains — multi-agent orchestration security (beta)

> Sprint MAOS — beta. Single-agent flows keep working unchanged.

### Why

LangGraph, CrewAI, AutoGen, OpenAI Swarm, Claude sub-agents — the world is moving from one agent doing one thing to **swarms of agents calling each other and tools**. Nobody owns the security layer for that yet. Nomos models the chain natively: each child UCAN attenuates its parent, the PDP sees the whole chain on every authorize, and audit log links each receipt to the parent that triggered it.

### Vocabulary additions

| Term | What it means |
|---|---|
| **Swarm** | A tree of Apps that delegate to each other. Rooted at one App. Bounded by `NOMOS_MAX_CHAIN_DEPTH` (default 8). |
| **Chain** | The root-first JWT array of UCANs from the root App down to the leaf that's making the current call. Validated end-to-end on every authorize. |
| **Attenuation** | Each child's capability is a strict subset of its parent's — narrower command, narrower resource, shorter TTL, or all three. PDP rejects any "broadening" link as `chain_attenuation_violation`. |
| **Causation** | `auditEvents.parent_receipt_id` back-links each receipt to the parent authorize that triggered it. Orthogonal to `prev_hash` (tamper chain). |
| **Snapshot approval** | A step-up that covers "this App and its current children" — the child set is materialized at approval time. New children forked after approval need a fresh approval. Never auto-extends. |

### Wire format (orchestrator-agnostic)

Every SDK reads these env vars; any orchestrator wires them on child-process spawn without importing our SDK:

| Var | Shape | Purpose |
|---|---|---|
| `NOMOS_PARENT_UCAN_CHAIN` | JSON `string[]` (root-first) | Full chain to authorize against. |
| `NOMOS_PARENT_UCAN_CHAIN_FILE` | path | Fallback when env exceeds OS limits (~128KB). |
| `NOMOS_PARENT_RECEIPT_ID` | string | Causation back-link. |
| `NOMOS_SWARM_ID` | uuid | Explicit swarm hint. |
| `NOMOS_MAX_CHAIN_DEPTH` | int (default 8) | Override depth cap. |

W3C `traceparent` header is propagated end-to-end so spans link orchestrator → PDP authorize → egress to upstream SaaS.

### TypeScript

```ts
import { createAuthGuard, forkChild } from '@auto-nomos/sdk';

const guard = createAuthGuard({ apiKey, pdpUrl });

// authorize() auto-detects NOMOS_PARENT_UCAN_CHAIN and prepends it.
const decision = await guard.authorize({ ucan, command, resource, context: {} });

// Fork an attenuated child for a sub-agent.
const { env } = forkChild({
  parentChain: [rootUcan],
  childUcanJwt: childUcan,
  parentReceiptId: decision.receiptId,
});
spawn('node', ['./child.js'], { env: { ...process.env, ...env } });
```

### Python

```python
from nomos import AuthGuard, fork_child

guard = AuthGuard(api_key=..., pdp_url=...)
decision = guard.authorize(ucan=root_ucan, command='/github/issue/list',
                           resource={'repo': 'org/test-repo'})

chain, env = fork_child(
    parent_chain=[root_ucan],
    child_ucan_jwt=child_ucan,
    parent_receipt_id=decision.receipt_id,
)
subprocess.Popen([sys.executable, 'child.py'], env={**os.environ, **env})
```

### Any other runtime

Use the `nomos-ucan` CLI (Bun-compiled, install via `npm i -g @auto-nomos/ucan-cli`):

```bash
nomos-ucan fork --parent-chain ./chain.json --child-jwt $CHILD \
  --parent-receipt-id $RECEIPT --swarm-id $SWARM
# prints {chain, env} JSON; merge env into child process spawn.
```

### Cedar swarm-safe templates

Every Cedar policy can now reason about chain attributes:

- `principal.delegationDepth` — `Long`, 0 for root, +1 per hop.
- `principal.rootAgent` — `String`, the root agent's DID.
- `principal.invokedBy` — `Set<String>`, every ancestor agent's DID.

Four templates ship in `packages/schema-packs/swarm-safe/`:

```cedar
// Cap delegation depth.
forbid (principal, action, resource) when { principal.delegationDepth > 3 };

// Pin root agent.
permit (principal, action, resource)
when { principal.rootAgent == "<root-did>" };

// Block tainted-ancestor chains.
forbid (principal, action, resource)
when { principal.invokedBy.contains("<tainted-did>") };

// Sensitive ops only at root.
forbid (principal, action, resource) when { principal.delegationDepth > 0 };
```

### Dashboard — full walkthrough

We'll trace the actual prod swarm we ship with: **`prod-test-swarm`** =
`planner → researcher → writer`, all hitting `GET /repos/{owner}/{repo}/issues`.

#### 1. `/app/agents` — register the three apps

Each app gets:
- a **name** (planner/researcher/writer)
- an Ed25519 keypair (server-side; private key sealed with XChaCha20-Poly1305 in `agents.encrypted_signing_key`)
- a `did:key:…` identity (printed once on creation; visible in audit forever)
- an **API key** (also visible once — copy now or rotate later from the row's `…` menu)

```
┌─ /app/agents ────────────────────────────────────────────────────────┐
│  Apps                                              [ + Create app ]  │
│ ──────────────────────────────────────────────────────────────────── │
│  Name        DID                  API key       Created              │
│  planner     did:key:z6Mkn4yNxX…GNK2  ●●●● [copy]  May 14, 11:30 AM  │
│  researcher  did:key:z6Mkv17c99…WgkP  ●●●● [copy]  May 14, 11:31 AM  │
│  writer      did:key:z6MkonEga5…dfLb  ●●●● [copy]  May 14, 11:32 AM  │
└──────────────────────────────────────────────────────────────────────┘
```

#### 2. `/app/connections` — bind the upstream OAuth

Click **+ Connect GitHub**, finish the OAuth dance, copy the connection UUID
from the row. The OAuth refresh token is sealed at rest; the planner's UCAN
later carries this connection ID inside its capability.

#### 3. `/app/policies` → assign **Safe default github** to all three apps

The same Cedar bundle drives every hop. Want the writer to need approval on
`/github/issue/create`? Add a `forbid` rule when `principal.delegationDepth > 0`
or `action == /github/issue/create` (cosigner required). PDP enforces on
**every link**, not just the leaf.

#### 4. `/app/swarms` → create the swarm

Pick a name, pick the **root agent** (`planner`), set max depth (default 8).
The swarm row appears immediately. Open it.

#### 5. `/app/swarms/{id}` — the swarm view

```
┌─ prod-test-swarm                                  [⏵ Connect agents]┐
│  3 agents · max depth 8                                              │
├──────────────────────────────────────────────────────────────────────┤
│ ● Agent tree                                                         │
│   ├── ● planner       did:…GNK2  depth 0  (root)                     │
│   │   └── ● researcher did:…WgkP  depth 1                            │
│   │       └── ● writer did:…dfLb  depth 2                            │
├──────────────────────────────────────────────────────────────────────┤
│ ● Attach child agent                                                 │
│   Parent  [ planner ▾ ]   Child  [ researcher ▾ ]   [ Attach ]      │
│   "Child UCAN must be minted by parent — DB attach is metadata only" │
├──────────────────────────────────────────────────────────────────────┤
│ ● Approve for chain                                                  │
│   Root agent [ planner ▾ ]   TTL [ 1 h ▾ ]                          │
│   Snapshot covers: planner, researcher, writer (3 agents @ now)      │
│   [ Approve & mint cosigner ]                                        │
├──────────────────────────────────────────────────────────────────────┤
│ ● Scope containment                                                  │
│   planner    last allow  /github/issue/list  depth 0  11:57 AM       │
│   researcher last allow  /github/issue/list  depth 1  11:57 AM       │
│   writer     last allow  /github/issue/list  depth 2  11:57 AM       │
├──────────────────────────────────────────────────────────────────────┤
│ ● Recent receipts                                                    │
│   When                  Decision  Command            Agent  Depth Receipt │
│   May 14, 11:57:17 AM   allow     /github/issue/list writer  2  a6719553… │
│   May 14, 11:57:14 AM   allow     /github/issue/list resrch  1  051e8a28… │
│   May 14, 11:57:12 AM   allow     /github/issue/list planr   0  e1cf6267… │
│   (Agent column shows the friendly name; hover for full DID)         │
└──────────────────────────────────────────────────────────────────────┘
```

What each card does:

- **Agent tree** — pure visual; tree comes from `agents.parentAgentId`.
  Collapses past depth 3.
- **Attach child agent** — metadata only. The PDP still requires that the
  child UCAN's `iss == parent.aud`; this card just teaches the dashboard the
  shape so trees and snapshots render correctly.
- **Approve for chain** — pick a root + TTL. The snapshot is materialized
  at click time: `approvedAgentIds = [planner.id, researcher.id, writer.id]`.
  A child forked **after** approval is **not** covered. Approval issues a
  cosigner UCAN whose `aud` is the snapshot set; the PDP three-layer check
  (Cedar → step-up → cosigner) sees it on every hop and waives the step-up
  for any agent in the snapshot.
- **Scope containment** — quick sanity check. For each agent: most recent
  allow + chain depth. If a child shows `depth=4` against a `maxDepth=3`
  swarm, you'll see it here before audit even loads.
- **Recent receipts** — last 100 authorize calls scoped to the swarm. Same
  Cedar decision rows you'd see in `/app/audit`, filtered to this swarm.
  Hover any agent to reveal the full DID; click any receipt → opens
  `/app/audit?event=<id>` for the proof drawer.

#### 6. `/app/audit` — causation walking

Same rows; cross-swarm view. The **App** column shows the app's friendly
name; hover for the full DID. Click any row → drawer opens with:

- `event_id`, `prevHash`, `hash` (tamper chain)
- `parent_receipt_id`, `chainDepth`, `swarmId` (causation chain)
- full `resource` + `context` (collapsible JSON)
- **Download proof** — JSON bundle with the event + every event after it up
  to the latest signed root. Verify offline:

  ```
  npx @auto-nomos/audit-verify audit-proof-<eventId>.json
  ```

- **CSV / JSON export** (top-right) now ships the whole row — `agentName`,
  `agentDid`, `command`, `decision`, `eventId`, `prevHash`, `hash`,
  `chainDepth`, `swarmId`, `parentReceiptId`, `resource`, `context`. Pipe it
  straight into Splunk / Datadog / your data warehouse.

#### 7. Approval flows — where each one fires

| Approval surface | Trigger | Scope | Where to find |
|---|---|---|---|
| **One-shot push approval** | Cedar → step-up on a single call | one (agent, command, resource) tuple | `/app/approvals` (per-app) |
| **Snapshot chain approval** | Operator preempts; covers a tree at a moment | the materialized agent set; new children excluded | `/app/swarms/{id}` → Approve for chain |
| **Mid-chain step-up** | Writer hits a write-protected command mid-flow | that single call; resolves via `/approve/{envelopeId}` | mobile push / email / `/app/approvals` |

The first one is the day-1 default. The second is the swarm-aware shortcut
for "I trust this whole tree for the next hour, stop pinging me." The third
is what fires when a deeper agent unexpectedly needs a privileged op.



### Audit walking

Pull a bundle and walk the causation tree (hash chain still verified per node):

```bash
nomos audit-verify --chain ./bundle.json
# prints colored ALLOW/DENY/STEPUP tree; exits 1 on any link tampered with.
```

### Reference integrations

- [`examples/langgraph-nomos`](examples/langgraph-nomos/) — 3-node Python chain (planner → researcher → writer) hitting GitHub through Nomos with mid-chain step-up.
- [`examples/crewai-nomos`](examples/crewai-nomos/) — CrewAI Task wrapper that authorizes every tool call.
- [`examples/claude-subagents-nomos`](examples/claude-subagents-nomos/) — Claude Code sub-agent invocation through the `Task` tool.

### Limits

- **Chain depth**: capped at `NOMOS_MAX_CHAIN_DEPTH` (default 8). Larger swarms federate at the application layer.
- **Cross-customer chains**: `swarms.cross_customer_enabled` column is a reserved design hook (Phase 2 federation). Enforcement stays intra-customer at launch.
- **Env size**: chain JSON in env var bounded by OS limits (~128KB). Use `NOMOS_PARENT_UCAN_CHAIN_FILE` fallback for deep chains with bulky UCANs.

Full technical details in [docs/SWARM_SECURITY.md](docs/SWARM_SECURITY.md).

### Test locally — two ways

You can prove the full chain works on your laptop in five minutes. Both paths
talk to the same control plane + PDP — only the orchestration shape differs.

**Path A — subprocess chain (single-machine, fastest).**

A parent process spawns its child via `child_process.spawn`, propagating the
chain through `NOMOS_PARENT_UCAN_CHAIN`. Three roles, three processes,
one terminal.

1. `pnpm db:up` (postgres on `:5433`)
2. `pnpm dev` (control plane on `:8788`, PDP on `:8787`)
3. In the dashboard:
   - `/app/agents` → create three apps named `planner`, `researcher`, `writer`. Issue an API key for each (visible once — copy it).
   - `/app/connections` → bind GitHub. Note the connection UUID.
   - `/app/swarms` → create a swarm rooted at `planner`. Use **Attach child agent** to attach `researcher` under planner, then `writer` under researcher.
4. `cp .env.swarm.example .env.swarm`. Fill in: 3 API keys, researcher + writer agent UUIDs, swarm UUID, GitHub connection UUID, owner + repo.
5. `pnpm demo:swarm`

You should see, in order:

```
━━━ planner ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✓ minted root UCAN  cmd=/github/issue/list
  ✓ proxy allow       receipt=8c1f02ab…
  ✓ github status     200
━━━ planner → researcher fork ━━━━━━━━━━━━━━━━━━━━━━━━
  ✓ minted child UCAN cid=92ab… chain.depth=2
━━━ researcher (depth=1) ━━━━━━━━━━━━━━━━━━━━
  ✓ proxy allow       receipt=…
  ✓ github status     200
━━━ writer (depth=2) ━━━━━━━━━━━━━━━━━━━━
  ✓ proxy allow       receipt=…
  ✓ github status     200
```

Open `/app/swarms/<id>` — the tree shows three nodes; recent receipts shows
three green allow rows. The Audit page lets you walk causation: every leaf
receipt links back to its parent.

To trigger a mid-chain step-up, set `NOMOS_DEMO_WRITE=1` in `.env.swarm` and
rerun. Writer will attempt `POST /repos/.../issues`; if your Cedar policy
requires cosigner for `/github/issue/create`, the PDP returns
`requiresStepUp=true`. The script blocks; the dashboard shows a pending
approval; you click Approve, the script retries with the cosigner attached,
and the call lands.

**Path B — docker swarm (multi-process, mirrors production-like topology).**

Three docker services, each is a different agent. Chain propagates over
HTTP between containers (env-var handoff would not work cross-container).
A fourth container, the orchestrator, exposes a tiny HTML control panel on
`localhost:3100`.

1. `pnpm dev:up` (host stack — postgres + cp + pdp + dashboard)
2. Same dashboard bootstrap as Path A (3 apps + GitHub connection + swarm).
3. Same `.env.swarm`.
4. `pnpm swarm:up`
5. Open `http://localhost:3100`. Click **▶ Run swarm**.
6. Watch the live log fill in as orchestrator → researcher → writer hand
   the chain along. Open `/app/swarms/<id>` in another tab to see the tree
   light up in real time.

Tear down: `pnpm swarm:down`.

Both paths use the new control-plane endpoint `POST /v1/mint-child-ucan`,
which signs the child UCAN with the parent agent's per-agent Ed25519 key
(sealed at agent registration). That's what makes `validateChain()` accept
the resulting `iss == parent.aud` chain — without per-agent keys you cannot
prove a child was actually delegated by its parent and not minted by the
control plane on its own.

---

## Cloud IAM — Azure, AWS, GCP (federated, no stored keys)

> Sprint Cloud M0–M9. Reuses Cedar + UCAN + audit chain + step-up exactly
> the same as SaaS — only the connection model + token exchange is new.

### Why

Native cloud IAM (Azure RBAC, AWS IAM, GCP IAM) is excellent for *humans*.
For agents it forces the worst pattern: a long-lived static credential
sitting on disk (or worse, in env). Nomos brokers cloud the same way it
brokers SaaS — except there's no token to store. We host an OIDC issuer at
`id.auto-nomos.com`, your cloud trusts it via federation, and we mint a
fresh ID token per request which gets exchanged for a short-lived cloud
session credential. **Zero standing cloud secrets in your workspace.**

### Vocabulary

| Term | What it means |
|---|---|
| **Cloud account** | Your cloud binding — Azure subscription, AWS account, or GCP project. Lives in `cloud_connections`. Carries the connector + per-cloud config (subscription/role-arn/wif-provider). No tokens stored — token exchange happens per-request. |
| **OIDC issuer** | `id.auto-nomos.com`. Serves `/.well-known/openid-configuration` + `/jwks.json` via a Cloudflare Worker. RS256 signing keys live in AWS KMS; the worker reads `oidc_issuer_keys` for the JWKS. |
| **Federation token** | The short-lived (5min default) OIDC ID token Nomos mints per request. `sub=customer/<cid>/agent/<aid>`, `aud` per-cloud (`api://AzureADTokenExchange` / `sts.amazonaws.com` / `<wif-provider-resource-name>`). The cloud STS / AAD / GCP-STS verifies our signature, then issues a session credential bound to your IAM role / SA / app-registration. |
| **Session credential** | The short-lived cloud bearer or SigV4 creds returned by the cloud (1 hour typical). Cached in-process for 15 minutes (60s safety margin) per `(connection, scope)` key. Disconnect or revoke flushes the cache. |
| **Connector** | `azure` \| `aws` \| `gcp`. Each has its own provider implementation in `apps/control-plane/src/cloud/providers/` and its own schema-pack in `packages/schema-packs/src/<connector>/`. |
| **Bootstrap status** | `pending` → `verified` → `broken`. Set by the verify-poll worker (24h cadence, 2-strike rule) and the manual "Verify now" mutation. `pending` rejects calls; `broken` calls succeed but you get a dashboard warning. |
| **raw_call** | Per-cloud escape hatch action (`/azure/raw_call`, `/aws/raw_call`, `/gcp/raw_call`). Cedar-gated stricter than typed actions — first use of a new `(host, path_prefix)` tuple per customer always cosigns. |

### Architecture in one diagram

```
[ agent code ]
     │  authorize + apiCall
     ▼
[ PDP /v1/proxy ]                 ── Cedar eval + step-up + risk rules
     │  cloud_connection_id on UCAN meta
     ▼
[ CP /v1/internal/cloud/api-call/:id ]
     │  1. mint OIDC ID token (RS256 via AWS KMS)        → cloud.token.minted (audit)
     │  2. POST to AAD / STS / GCP-STS                   → cloud.federation.exchanged (audit)
     │  3. signAndCall(session-creds, request)
     │
     ▼  per cloud:
   Azure: AAD client_credentials w/ JWT-bearer assertion → AAD bearer
   AWS:   sts:AssumeRoleWithWebIdentity → STS creds → SigV4 sign
   GCP:   sts.googleapis.com:token → iamcredentials:generateAccessToken
     │
     ▼  upstream call (management.azure.com / *.amazonaws.com / *.googleapis.com)
     │
     ▼
[ PDP emits cloud.call.allowed audit row + agent_span row ]
[ all rows carry the same swarm_id + parent_receipt_id + chain_depth ]
```

Three audit kinds per cloud call: `cloud.token.minted`, `cloud.federation.exchanged`, `cloud.call.allowed`. All three hash-chain through the same writer (PDP) and now correlate to the same swarm + parent receipt as any SaaS proxy row — so the swarm detail page lists cloud calls alongside GitHub / Slack calls in one timeline.

### Cloud onboarding — Terraform (the only safe way)

Customer trust requirement: **you read the IAM module before applying it.** No SaaS-side terraform-apply button. Modules live in three separate public repos so they show up in your Terraform tooling as third-party code, not a vendor blob:

| Cloud | Module | What it creates |
|---|---|---|
| Azure | `github.com/auto-nomos/terraform-azurerm-nomos-bootstrap` | `azuread_application` + `azuread_service_principal` + `azuread_application_federated_identity_credential` (issuer=`id.auto-nomos.com`, audience=`api://AzureADTokenExchange`, subject=`customer/<cid>/agent/<aid>` — pattern-matched server-side) + `azurerm_role_assignment` (Reader at sub scope by default, narrow to RG via variable). |
| AWS | `github.com/auto-nomos/terraform-aws-nomos-bootstrap` | `aws_iam_openid_connect_provider` (thumbprint of our JWKS) + `aws_iam_role` w/ trust policy (`Federated=<provider-arn>`, `sub=customer/<cid>/agent/<aid>`) + `ReadOnlyAccess` managed policy attachment. Region defaults to `us-east-1`; GovCloud is a separate variant. |
| GCP | `github.com/auto-nomos/terraform-google-nomos-bootstrap` | `google_iam_workload_identity_pool` + `google_iam_workload_identity_pool_provider` (issuer URI + audience + attribute mapping) + `google_service_account` + `google_service_account_iam_member` for `roles/iam.workloadIdentityUser` + `roles/iam.serviceAccountTokenCreator`. SA roles default to `roles/viewer`. |

After `terraform apply`, copy the outputs (subscription_id + app_id + tenant_id for Azure; account_id + role_arn for AWS; project_id + project_number + wif_provider + sa_email for GCP). The dashboard connect wizard pastes those into a JSON body the CP turns into a `cloud_connections` row.

The `nomos` CLI ships a helper that wraps each TF module:

```bash
# Bootstrap an Azure tenant (interactive):
nomos cloud-install azure
# AWS:
nomos cloud-install aws --role-name nomos-broker-readonly --region us-east-1
# GCP:
nomos cloud-install gcp --project my-proj --service-account nomos-broker
```

The CLI does not apply Terraform for you — it scaffolds a `cloud-bootstrap/` directory with a versioned module pin and prints the `terraform init && terraform apply` commands. You run them.

### Dashboard — `/app/cloud`

Top-level nav under **Build**. Lists every `cloud_connections` row with:

| Column | Source |
|---|---|
| Cloud | Connector emoji + name (`Azure` / `AWS` / `GCP`) |
| Account / subscription | `accountId` (subscription_id / account_id / project_id) + tenant_id sub-row for Azure |
| Status | `bootstrap_status` badge: `verified` (green), `pending` (yellow), `broken` (red). On error, the `last_verify_error` is rendered under the badge. |
| Last verified | `last_verified_at` formatted local time, or "never". |
| Actions | **Verify now** (manual one-shot probe) · **Disconnect** (deletes the row + flushes the creds cache for that connection). |

The bottom **Connect a new cloud** card shows three buttons → wizards under `/app/cloud/connect/{azure,aws,gcp}`. Each wizard:

1. Pastes the Terraform outputs into a form.
2. Calls `cloudConnections.create` tRPC mutation.
3. Polls `cloudConnections.verifyNow` until status flips to `verified` (or fails after the 2-strike retryable threshold).

Once `verified`, the agent flow is identical to OAuth: mint a UCAN carrying `meta.cloud_connection_id`, call `/v1/proxy`, PDP routes through the cloud branch.

### Cloud Cedar policies

Same Cedar engine. New action namespace per cloud (matches the schema-pack actions):

```cedar
// Azure: allow VM reads, deny destructive verbs.
permit (principal,
        action in [Action::"/azure/vm/list", Action::"/azure/vm/get"],
        resource)
when { resource.subscription_id == "00000000-0000-0000-0000-000000000000" };

// AWS: only list buckets in account 1234, require cosigner on delete.
permit (principal,
        action == Action::"/aws/s3/list_buckets",
        resource)
when { resource.account_id == "123456789012" };

forbid (principal,
        action == Action::"/aws/s3/delete_bucket",
        resource)
unless { context.cosigner_present == true };

// GCP: pin to one project.
permit (principal, action like "/gcp/*", resource)
when { resource.project_id == "my-prod-proj" };
```

The visual policy builder (Sprint 7) covers the curated actions out of the box. Cloud-scope picker dropdowns are seeded from each pack's `actions.ts`.

### Schema-pack action catalogs

| Connector | Curated actions | raw_call escape hatch |
|---|---|---|
| **azure** | `subscriptions/list`, `resource_groups/list`, `resources/list_by_rg`, `vm/{list,get,start,stop,restart,delete,run_command}`, `vmss/scale`, `aks/{cordon_node,drain_node}`, `storage_accounts/{list,delete}`, `blob_containers/list`, `blob/{read,write}`, `key_vaults/{list,rotate_secret,delete}`, `app_services/{list,restart,redeploy,slot_swap}`, `acr/{push,tag}`, `pipelines/trigger`, `metrics/get`, `cosmos/query`, `synapse/query`, `log_analytics/kql`, `cost_management/query`, `deployments/{create,get}`, `resource_groups/delete` | `/azure/raw_call` (method + host + path_prefix Cedar-gated) |
| **aws** | `sts/get_caller_identity`, `ec2/{list,describe,start,stop,reboot,terminate}`, `s3/{list_buckets,list_objects,get_object,put_object,delete_object,delete_bucket}`, `lambda/{list,invoke}`, `iam/list_*`, `rds/{describe,reboot}`, `cloudwatch/{get_metric,query_logs}`, `cost_explorer/query`, `cloudformation/{describe,update_stack}` | `/aws/raw_call` |
| **gcp** | `cloudresourcemanager/projects.list`, `compute/{instances.list,instances.get,instances.start,instances.stop,instances.delete}`, `storage/{buckets.list,objects.list,objects.get,objects.delete}`, `bigquery/{datasets.list,jobs.query}`, `cloudfunctions/{list,invoke}`, `iam/serviceaccounts.list`, `monitoring/timeSeries.list`, `logging/entries.list` | `/gcp/raw_call` |

Every destructive verb (`delete`, `stop`, `drain`, `scale_down`, `rotate`, `redeploy`, `run_command`, `invoke`, `terminate`) is force-cosigner-required by `apps/pdp/src/services/cloud-risk-rules.ts` regardless of Cedar — defense-in-depth against an over-permissive policy.

### Granting permission — three layers, in order

1. **Cloud-side IAM grant** — the Terraform module attaches a role/policy to the federated identity. Narrow the grant: `Reader` at RG scope (Azure), `s3:GetObject` on one bucket (AWS), `roles/storage.objectViewer` on one project (GCP). The federated identity can never do more than what your cloud IAM allows.
2. **Cedar policy** — what the agent is permitted to ask the PDP for. Strictly narrows the IAM grant; can carry context-aware rules the IAM language can't express (`context.time.hour < 18`, `principal.delegationDepth < 2`, `resource.repo == "...".`).
3. **UCAN capability** — the time-bounded, App-bound capability the SDK presents per call. Always a subset of the policy. Revocation kills the UCAN → next call denies.

The agent's *effective* permission is the intersection of all three. Add a fourth layer if you're in a swarm: the chain-attenuation rule (each child ⊆ parent).

### Step-up / cosigner

Identical to SaaS. Cedar marks the policy `requiresStepUp` or `cloud-risk-rules` force-injects cosigner on destructive verbs → PDP returns `403 cosigner_required` → operator approves via Knock push or `/app/approvals` → agent retries with cosigner-signed UCAN → PDP three-layer check (Cedar → step-up envelope → cosigner UCAN) → allow.

For chain calls the snapshot approval from `/app/swarms/{id}` covers the whole tree at approval time — every cloud call from any agent in the snapshot waives step-up for the TTL window, no matter the depth.

### Audit + observability for cloud

Every cloud call lands as **three** audit rows (`cloud.token.minted` + `cloud.federation.exchanged` + `cloud.call.allowed`) plus **one** `agent_spans` row. All four carry:

| Field | Source |
|---|---|
| `customer_id` | UCAN meta.customer_id |
| `agent_id` (via `audit_events.agent_did`) | UCAN leaf aud |
| `swarm_id` | request.swarm_id (forwarded from authorize) |
| `parent_receipt_id` | request.parent_receipt_id (forwarded from authorize) |
| `chain_depth` | derived from delegated_chain length |
| `api_call_method` + `api_call_path` (cloud.call only) | apiCall.{method,path} |
| `request_args_hash` + `request_summary` (span only) | sha256 + redacted allowlist |
| `response_hash` + `response_summary` (span only) | sha256 + redacted allowlist |
| `next_agent_hint` + `intent` (span only) | optional agent-declared narrative |

Visit `/app/swarms/{id}` after a cloud call: the **Action Graph** + **Action Timeline** components surface the cloud span alongside any OAuth spans. The **Blast Radius** card includes cloud-touched resources. **Scope Containment** lists per-cloud-action coverage.

Visit `/app/audit` → click any row whose command starts with `/azure/`, `/aws/`, or `/gcp/`: the proof drawer shows the api_call_method + api_call_path (0027) plus the chain context — same shape as a SaaS row. **CSV / JSON export** also covers cloud rows.

### Egress proxy — cloud-host CONNECT gate (defense-in-depth)

`apps/egress-proxy` is observe-only by default. When `EGRESS_PROXY_REQUIRE_TOKEN_FOR_CLOUDS=1` is set, the proxy:

1. Detects cloud target hosts on CONNECT (`*.amazonaws.com`, `management.azure.com`, `*.googleapis.com`).
2. Validates the PDP-issued `proxy-authorization` token.
3. Refuses cloud-bound CONNECTs with no/invalid token (403).
4. Logs `cloud: {connector, service, region}` on `EgressObservation` + `traceparent` for MAOS span correlation.

If `EgressObservation.cloud` is populated AND `traceparent` is populated, the audit row from the corresponding PDP call lines up trivially with the egress observation via the trace ID.

### Verify-poll worker (drift detection)

`apps/control-plane/src/workers/cloud-verify-poll.ts` runs on a 24-hour timer for every `verified` connection. Per cycle it probes the cloud (Azure: `subscriptions.get`, AWS: `sts:GetCallerIdentity`, GCP: `cloudresourcemanager:projects.get`):

- **Pass** → `last_verified_at = now()`, `last_verify_error = null`.
- **Retryable failure** (5xx, throttle) → first failure ignored; second consecutive flips status to `broken`.
- **Non-retryable** (4xx, role removed) → flip to `broken` immediately.

Customers reverting the Terraform-managed role by hand thus show up in the dashboard within 24 hours. The `verifyNow` mutation runs the same probe on demand.

### Cloud raw_call — escape hatch with safety net

`/<connector>/raw_call` is the catch-all action for "I need to call an API we don't ship a typed schema for." Cedar policy:

```cedar
permit (principal, action == Action::"/azure/raw_call", resource)
when {
  resource.method == "GET" &&
  resource.host == "management.azure.com" &&
  resource.path_prefix in ["/subscriptions", "/providers/Microsoft.Compute"] &&
  context.cosigner_present == true
};
```

First use of any new `(host, path_prefix)` tuple per customer always cosigns even if Cedar would `permit` without the cosigner clause — the PDP keeps a per-customer "seen-tuples" history in `agent_policies` and flips a sticky bit after the first approval. Add a tuple via the dashboard or by approving it once via step-up.

### End-to-end testing — three real-cloud paths

Each connector ships an e2e test gated on `NOMOS_<CLOUD>_TEST_<ACCOUNT|TENANT|PROJECT>=1`. CI runs them nightly against `nomos-ci-<cloud>` test accounts; PRs skip them.

| Test | Env contract | Asserts |
|---|---|---|
| `apps/pdp/src/__tests__/cloud-azure.e2e.test.ts` | NOMOS_AZURE_TEST_TENANT + subscription + app_id + tenant_id + service-token | mint → AAD exchange → ARM `GET /subscriptions/<sub>/resourcegroups` 200 |
| `apps/pdp/src/__tests__/cloud-aws.e2e.test.ts` | NOMOS_AWS_TEST_ACCOUNT + account_id + role_arn + region | mint → STS AssumeRoleWithWebIdentity → SigV4-signed `STS:GetCallerIdentity` 200 |
| `apps/pdp/src/__tests__/cloud-gcp.e2e.test.ts` | NOMOS_GCP_TEST_PROJECT + project + wif_provider + sa_email | mint → STS exchange → SA impersonation → `cloudresourcemanager:projects.list` 200 |

Each test also asserts the second call hits the creds cache (`cache_hit=true`) and that a destructive action returns `cosigner_required` without `context.cosigner == true`.

### Test locally — Azure happy path (no real cloud needed)

```bash
# Mock AAD + ARM at the fetch boundary, unit-test the full PDP→CP→provider chain:
pnpm --filter @auto-nomos/control-plane test -- cloud-internal
pnpm --filter @auto-nomos/pdp test -- cloud-adapter cloud-risk-rules
```

Those run in ~2s and cover the mint → exchange → call pipeline + chain context forwarding + risk-rules enforcement.

### Operational checklist before going live

1. ✅ AWS KMS key created for the OIDC signing key (RS256), policy granting CP `kms:Sign` only.
2. ✅ Cloudflare Worker for `id.auto-nomos.com` deployed (`apps/oidc-issuer/wrangler.toml`).
3. ✅ DNS for `id.auto-nomos.com` pointed at the Worker.
4. ✅ `OIDC_ISSUER_URL=https://id.auto-nomos.com` + `OIDC_KMS_KEY_REF=arn:aws:kms:...` set in CP env.
5. ✅ `PDP_WEBHOOK_URLS=https://pdp.auto-nomos.com/v1/internal/audit/emit-cloud` set in CP env (publishers route here).
6. ✅ Migration 0028 applied (`apps/control-plane/db/migrations/0028_cloud_iam_m0.sql`).
7. ✅ Customer runs `terraform apply` on the bootstrap module for their cloud.
8. ✅ Customer pastes outputs into `/app/cloud/connect/<connector>` wizard.
9. ✅ Dashboard shows `verified` status — first agent call ready.
