# @auto-nomos/sdk

TypeScript SDK for the Credential Broker authorization layer. Wrap any
upstream call (GitHub, Slack, Stripe, your own API) in `guard.authorize()` and
the call only runs if your customer's policy says it can.

> **Default is fail-closed.** PDP unreachable, malformed response, or any
> non-allow decision returns a deny. Override only if you understand the
> security trade-off (see _Failure modes_ below).

## Install

```bash
npm install @auto-nomos/sdk
# or pnpm / yarn / bun equivalent
```

## 3-line integration

```ts
import { createAuthGuard } from '@auto-nomos/sdk';

const guard = createAuthGuard({ apiKey: process.env.CB_API_KEY!, pdpUrl: process.env.CB_PDP_URL! });
const decision = await guard.authorize({ ucan, command: '/github/issue/create', resource: { repo: 'acme/billing' }, context: {} });
if (decision.allow) await octokit.rest.issues.create({ owner: 'acme', repo: 'billing', title });
```

That's the wedge. Everything below is reference.

## API

### `createAuthGuard(options) → AuthGuard`

| Option | Type | Default | Notes |
|---|---|---|---|
| `apiKey` | `string` | required | Format: `cb_<customerId>_<secret>`. The customer UUID is parsed out and sent as `x-cb-customer`; the full key is sent as `Authorization: Bearer`. |
| `pdpUrl` | `string` | required | Base URL of the PDP (no trailing slash required). |
| `failureMode` | `'closed' \| 'open'` | `'closed'` | What to return when the PDP is unreachable. **Leave as `closed` unless you have a written reason.** |
| `schema` | `string` | `undefined` | Optional schema-pack id; sent as `x-cb-schema`. |
| `fetchFn` | `typeof fetch` | `globalThis.fetch` | Override for testing or for environments without a global `fetch`. |
| `retry.maxAttempts` | `number` | `3` | Total attempts (not retries). Retries on 5xx and network errors only. 4xx returns immediately. |
| `retry.baseDelayMs` | `number` | `100` | Exponential backoff base. Delay between attempt N and N+1 is `base * 2**(N-1)`. |

### `guard.authorize(req) → Promise<AuthorizeDecision>`

```ts
type AuthorizeRequestInput = {
  ucan: string;                          // JWT minted by the control plane
  command: string;                       // e.g. '/github/issue/create'
  resource: Record<string, unknown>;     // shape depends on the schema pack
  context: Record<string, unknown>;      // ip, time, user attributes — passed to Cedar
};

type AuthorizeDecision = {
  allow: boolean;
  reason?: string;                       // 'policy_denied' | 'expired' | 'pdp_unreachable' | ...
  obligations?: Record<string, unknown>;
  receiptId: string;                     // pass to emitReceipt after the upstream call
  requiresStepUp?: boolean;
  stepUpUrl?: string;
};
```

Never throws under normal operation — retries are exhausted into a structured
deny (or allow, if `failureMode: 'open'`). Bad-shape responses return
`reason: 'pdp_invalid_response'`.

### `guard.emitReceipt(receiptId, input) → Promise<void>`

```ts
type ReceiptInput = {
  outcome: 'success' | 'failure';
  metadata?: Record<string, unknown>;
};

await guard.emitReceipt(decision.receiptId, { outcome: 'success', metadata: { issueId: 7 } });
```

Throws if the PDP returns non-2xx (caller decides whether to retry or swallow).
**Receipts are best-effort by design** — a failed receipt must not undo an
already-completed upstream call. The reference MCP server in `examples/mcp-github`
wraps `emitReceipt` in `.catch(() => undefined)` for this reason.

## Failure modes

| `failureMode` | When | Returns | Use case |
|---|---|---|---|
| `closed` (default) | PDP down, network error, malformed response, persistent 5xx | `{ allow: false, reason: 'pdp_unreachable' }` | **Almost always.** Authorization layer must default safest. |
| `open` | Same conditions | `{ allow: true, reason: 'pdp_unreachable_failopen' }` | Read-mostly tools where a partial outage shouldn't break the agent. Logging-only commands. Never use for write paths or financial actions. |

The default exists because authorization is a security primitive: silently
allowing requests when the policy engine is unreachable is the worst kind of
bug — it surfaces only during an incident and lets the wrong people through.

## Custom transport

`fetchFn` lets you swap in a Node `undici` agent, a Cloudflare Workers fetcher,
or a test double:

```ts
import { fetch } from 'undici';
const guard = createAuthGuard({ apiKey, pdpUrl, fetchFn: fetch as typeof globalThis.fetch });
```

## What's _not_ in here yet

- **OAuth proxy mode.** Sprint 5 adds `guard.proxy(command, request)` so the
  agent never holds the upstream OAuth token at all.
- **Step-up flow.** Sprint 9 adds `requiresStepUp` polling.
- **Rotation of PDP signing key cache.** Sprint 8.

Track in `docs/adr/` and the deferred decisions log of the build plan.
