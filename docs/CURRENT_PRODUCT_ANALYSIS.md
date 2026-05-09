# Credential Broker Current Product Analysis

Last reviewed: 2026-05-10

## One-sentence product definition

This repo currently implements an early credential broker for agents: a control plane mints scoped UCAN capability tokens and distributes signed Cedar policy bundles; a PDP runtime validates UCANs, evaluates policy, proxies approved SaaS API calls with stored OAuth tokens, writes audit events, handles revocation, and can trigger step-up approval.

It is not an agent runtime. The "agent" in this product is an identity and credential slot for any external runtime: Claude Desktop, Cursor, an MCP server, a Python script, an n8n workflow, or a custom service.

## What exists today

### Control Plane

Location: `apps/control-plane`

Implemented:

- Better-Auth email/password sign-up.
- Tenant/customer creation on sign-up.
- Agent registry with DID generation.
- API key issuance for agent SDK clients.
- OAuth connect/callback flow for GitHub, Slack, Google, and Notion.
- Encrypted OAuth token storage.
- UCAN minting bound to agent, command, optional policy, and optional OAuth connection.
- Cedar policy CRUD.
- Signed policy bundle endpoint for PDPs.
- Revocation records and push-to-PDP publisher.
- Audit listing and hash-chain proof API.
- Step-up approval rows, WebAuthn/passkey verification, and cosigner UCAN minting.
- Audit root signing and optional R2 archive worker.

Not yet complete:

- SCIM/OIDC IdP federation is represented in the vision, not shipped.
- Multi-region/data-residency control plane is not implemented.
- Customer switching/multi-tenant admin UX is minimal.
- API keys identify SDK clients, but the PDP's primary enforcement primitive is still the UCAN.

### PDP Runtime

Location: `apps/pdp`

Implemented:

- `POST /v1/authorize` validates a presented UCAN, checks revocation cache, evaluates Cedar, and emits audit. The core package supports UCAN chains; the current SDK/public request shape sends one token.
- `POST /v1/proxy/:command` runs authorization and, on allow, calls GitHub/Slack/Google/Notion using the customer's stored OAuth token.
- Signed policy bundle polling and stale-cache fallback.
- Revocation polling plus internal push refresh endpoint.
- Postgres and JSONL audit emitters.
- Receipt endpoint for post-action outcome logging.
- Step-up detection and SDK-facing polling.
- Optional root UCAN issuer pinning from `CONTROL_PLANE_BUNDLE_VERIFY_KEY`.
- Basic OpenTelemetry/Sentry hooks.

Not yet complete:

- The PDP is a Node/Hono service, not yet packaged as a single portable sandboxed binary.
- Cloud/edge/on-prem are deployment targets, not three polished install modes.
- Schema-pack validation is not wired into PDP enforcement yet.
- On-chain/ERC-7715 module is not implemented.
- Direct REST/gRPC adapters exist only as the generic OAuth proxy surface, not as productized non-MCP integration modules.

### Dashboard

Location: `apps/dashboard`

Implemented:

- Sign-in/sign-up pages.
- Onboarding wizard: connect SaaS, create agent, author starter policy.
- Agent list/detail, API key issue/revoke, delete agent.
- Policy list/new/edit pages with Cedar validation.
- Audit log page.
- Step-up approval page with passkey flow.

Current caveats:

- Visual policy builder package exists, but the policy detail page currently disables the visual tab pending a browser bundle refactor.
- The policy test panel is a placeholder.
- The dashboard is an admin console MVP, not a polished enterprise console.

### SDK And Example

Locations:

- `packages/sdk-typescript`
- `examples/mcp-github`
- `scripts/demo-real-github.mts`

Implemented:

- `createAuthGuard()` for authorize, receipt, proxy, and step-up polling.
- Fail-closed default behavior.
- MCP GitHub example that guards read repo, create issue, and merge PR tools.
- Real GitHub proxy demo script proving the key wedge: the agent never sees the upstream OAuth token.

## Current working wedge

The most real product path is:

1. A human signs up in the dashboard.
2. The human connects GitHub/Slack/Google/Notion OAuth.
3. The human creates an agent identity.
4. The human writes a Cedar policy such as:

```cedar
permit(
  principal,
  action == Action::"/github/user/read",
  resource
);
```

5. The control plane mints a short-lived UCAN for that agent and command.
6. External agent code calls the PDP through the SDK or `/v1/proxy`.
7. PDP validates UCAN + revocation + Cedar policy.
8. If allowed, PDP borrows the stored OAuth token and calls the SaaS API.
9. Audit rows are written with hash-chain integrity.

This proves the core credential broker idea: broad OAuth grants stay in the broker; agents receive narrow, time-bound, revocable capabilities.

## Local runbook

```bash
pnpm install
pnpm db:up
cp .env.example .env.local
pnpm gen-keys
pnpm --filter @credential-broker/control-plane db:migrate
pnpm dev
```

Open:

- Dashboard: `http://localhost:3000`
- Control plane: `http://localhost:8788`
- PDP: `http://localhost:8787`

For OAuth in local dev, run `pnpm tunnel` and set provider callback URLs to:

```text
https://<tunnel>/v1/oauth/callback/github
https://<tunnel>/v1/oauth/callback/slack
https://<tunnel>/v1/oauth/callback/google
https://<tunnel>/v1/oauth/callback/notion
```

For the real GitHub wedge demo:

```bash
pnpm tsx --env-file=.env.local scripts/demo-real-github.mts
```

## Product gaps against the target vision

| Target capability | Current state |
|---|---|
| Control plane / data plane split | Implemented as separate apps. |
| Signed policy distribution | Implemented. |
| UCAN validation | Implemented, with optional trusted root issuer pinning. Core supports chains; SDK/API currently send one token. |
| Cedar enforcement | Implemented. |
| OAuth to UCAN bridge | Implemented for GitHub, Slack, Google, Notion. |
| Agent never sees OAuth token | Implemented in `/v1/proxy`. |
| Audit receipts/hash chain | Implemented. |
| Revocation | Implemented for UCANs; agent deletion now revokes outstanding UCANs. |
| Step-up | Implemented with passkey/cosigner flow. |
| Schema library/packs | Templates exist; PDP schema validation not fully wired. |
| Customer-edge/on-prem PDP | Architecture supports it; packaging/operator UX not built. |
| On-chain spend enforcement | Not built. |
| SCIM/OIDC IdP federation | Not built. |
| Cross-org federation | Not built. |
| Visual policy builder | Package exists; dashboard integration currently disabled. |
| Production deploy/billing/docs site | Not built. |

## Recommended next build order

1. Make one demo path excellent: GitHub OAuth connect, create agent, create policy, mint UCAN, proxy `/github/user/read`, show audit.
2. Add a dashboard "Try this policy" panel that runs a dry authorization decision against the PDP.
3. Add API-key validation at the PDP edge or clearly demote API keys to SDK configuration and make UCAN the only bearer credential.
4. Wire schema packs into PDP request validation and dashboard template selection.
5. Package PDP deployment modes: shared cloud first, then customer-edge, then on-prem.
6. Re-enable visual policy builder only after it round-trips the same slash-command vocabulary as the SDK and schema packs.
