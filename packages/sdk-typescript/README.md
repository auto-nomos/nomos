# `@auto-nomos/sdk`

TypeScript client for the Nomos authorization layer. Wrap any agent call in
`client.authorize()` — only when your Cedar policy says yes does the call run.

> **Default is fail-closed.** PDP unreachable, malformed response, or any
> non-allow decision returns a deny. Opening the gate is opt-in only — see
> [Failure modes](#failure-modes).

## Install

```bash
pnpm add @auto-nomos/sdk
# or: npm i @auto-nomos/sdk / yarn add @auto-nomos/sdk
```

Node 22+. Not browser-safe (UCAN minting paths use Node crypto APIs).

## Five-line example

```ts
import { createIntentClient } from '@auto-nomos/sdk';

const client = createIntentClient({
  controlPlaneUrl: process.env.NOMOS_CONTROL_URL!,
  apiKey: process.env.NOMOS_API_KEY!,
});

const grant = await client.authorize({
  command: '/github/issue/list',
  resource: { provider: 'github', owner: 'acme', repo: 'app' },
  ttlSeconds: 300,
});
```

`grant.ucan` is a JWT-shaped delegation. Put it in `Authorization: Bearer …`
when you call the PDP.

## Real-world example — call GitHub through the PDP

```ts
import { createIntentClient } from '@auto-nomos/sdk';

const client = createIntentClient({
  controlPlaneUrl: process.env.NOMOS_CONTROL_URL!,
  apiKey: process.env.NOMOS_API_KEY!,
});

async function listOpenIssues(owner: string, repo: string) {
  const grant = await client.authorize({
    command: '/github/issue/list',
    resource: { provider: 'github', owner, repo },
    ttlSeconds: 300,
    purpose: 'triage open issues for the standup',
  });
  if (grant.decision !== 'allow') {
    throw new Error(`Nomos denied: ${grant.reason ?? grant.decision}`);
  }

  const res = await fetch(
    `${process.env.NOMOS_PDP_URL}/github/issue/list?owner=${owner}&repo=${repo}&state=open`,
    { headers: { authorization: `Bearer ${grant.ucan}` } },
  );
  if (!res.ok) throw new Error(`PDP error ${res.status}`);
  return (await res.json()) as { issues: { number: number; title: string }[] };
}
```

## Step-up handling

```ts
const grant = await client.authorize({ command: '/github/pr/create', /* … */ });

if (grant.decision === 'requires_step_up') {
  await notifyHumanToApprove(grant.approvalEnvelopeId);
  // wait for webhook / poll, then:
  const retried = await client.authorize({
    command: '/github/pr/create',
    cosignerEnvelopeId: grant.approvalEnvelopeId,
    /* … */
  });
  return retried;
}
```

In MCP hosts (Cursor, Claude, Codex) this is handled for you. In a backend agent
loop, you implement the wait — usually a dashboard webhook.

## Failure modes

| `failureMode` | Behavior | Use when |
|---|---|---|
| `'closed'` (default) | Throws on PDP unreachable / 5xx / malformed | **Almost always.** This is the whole point. |
| `'open'` | Returns `{ decision: 'allow', reason: 'pdp_unreachable_failopen' }` | Read-mostly flows behind a kill switch. Never for writes. |

Why fail-closed is the default: authorization is a security primitive. Silently
allowing requests when the policy engine is unreachable is the worst kind of
bug — surfaces only during incidents and lets the wrong people through.

## API surface

| Method | What |
|---|---|
| `authorize(req)` | Mint a UCAN for one command. |
| `intent(req)` | Dynamic-mode constraint envelope without committing to one command. |
| `revoke(cidOrEnvelopeId)` | Kill an envelope. Push fan-out within ~5s. |
| `verifyReceipt(receipt)` | Local hash + signature check on an audit receipt. |
| `forkChild({ parentChain, … })` | Build a child UCAN chain for swarm sub-agents. |

## Constructor options

| Option | Type | Default | Notes |
|---|---|---|---|
| `controlPlaneUrl` | `string` | required | `https://control.auto-nomos.com` hosted; self-host URL otherwise. |
| `apiKey` | `string` | required | Issued from an App detail page. |
| `failureMode` | `'closed' \| 'open'` | `'closed'` | Read [Failure modes](#failure-modes) before changing. |
| `fetch` | `typeof fetch` | `globalThis.fetch` | Swap for tracing, retries, mTLS. |
| `retry.maxAttempts` | `number` | `3` | Retries on 5xx + network errors only. 4xx fails fast. |
| `retry.baseDelayMs` | `number` | `100` | Exponential backoff base. |

## Custom transport

```ts
import { fetch } from 'undici';
import { createIntentClient } from '@auto-nomos/sdk';

const client = createIntentClient({
  controlPlaneUrl: process.env.NOMOS_CONTROL_URL!,
  apiKey: process.env.NOMOS_API_KEY!,
  fetch: fetch as typeof globalThis.fetch,
});
```

## Docs

Live docs: [docs.auto-nomos.com/connect/sdk-typescript](https://app.auto-nomos.com/docs/connect/sdk-typescript)
Step-up flow: [docs.auto-nomos.com/policies/step-up-approvals](https://app.auto-nomos.com/docs/policies/step-up-approvals)
Swarm forks: [docs.auto-nomos.com/policies/swarm-delegation](https://app.auto-nomos.com/docs/policies/swarm-delegation)
