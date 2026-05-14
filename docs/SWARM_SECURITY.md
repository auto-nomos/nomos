# Multi-Agent Orchestration Security (delegation chains)

> Sprint MAOS — beta. Single-agent flows keep working unchanged.

Nomos models *chains* of agents. When agent A invokes agent B which
invokes a tool, the PDP sees the full root → leaf UCAN chain on every
authorize call:

- **Trust propagation** — each child UCAN's `prf` (proof) field references
  its parent. `validateChain()` enforces signature continuity, audience
  match (`child.iss == parent.aud`), and time bounds across the whole
  chain.
- **Permission inheritance** — Cedar policies see new principal
  attributes (`delegationDepth`, `rootAgent`, `invokedBy`) computed
  from the validated chain. Templates in `packages/schema-packs/swarm-safe`.
- **Scope containment** — every link can only attenuate; the leaf can never
  hold capabilities its root didn't grant. Chain depth is capped at
  `NOMOS_MAX_CHAIN_DEPTH` (default 8) to bound runaway delegation.
- **Audit causation** — `auditEvents.parent_receipt_id` links each receipt
  to the parent authorize that triggered it. Walk a swarm trace with
  `audit-verify --chain <receiptId>`.
- **Swarm-scoped approval** — operators can approve a step-up "for this
  agent and current children". `approvedAgentIds` is materialized as a
  snapshot; children forked after approval need a fresh approval.

## Wire format

Orchestrator-agnostic env vars (every SDK reads them; LangGraph /
CrewAI / AutoGen / Claude sub-agents wire on child-process spawn):

| Var | Shape | Purpose |
| --- | --- | --- |
| `NOMOS_PARENT_UCAN_CHAIN` | JSON `string[]` (root-first) | Full chain to authorize against. |
| `NOMOS_PARENT_UCAN_CHAIN_FILE` | path | Fallback when env exceeds OS limits. |
| `NOMOS_PARENT_RECEIPT_ID` | string | Causation back-link. |
| `NOMOS_SWARM_ID` | uuid | Explicit swarm hint. |
| `NOMOS_MAX_CHAIN_DEPTH` | int | Override depth cap. |

W3C `traceparent` header is propagated end-to-end so spans link from the
orchestrator's parent span → PDP authorize → egress to upstream SaaS.

## Use

### TypeScript

```ts
import { createAuthGuard, forkChild } from '@auto-nomos/sdk';

const guard = createAuthGuard({ apiKey, pdpUrl });
const decision = await guard.authorize({ ucan, command, resource, context: {} });
// authorize auto-detects NOMOS_PARENT_UCAN_CHAIN and prepends it.

const { env } = forkChild({
  parentChain: [rootUcan],
  childUcanJwt: childUcan,
  parentReceiptId: decision.receiptId,
});
spawn('node', ['./child.js'], { env: { ...process.env, ...env } });
```

### Python

```python
from nomos import AuthGuard, fork_child, read_parent_chain_from_env

guard = AuthGuard(api_key=..., pdp_url=...)
decision = guard.authorize(ucan=root_ucan, command='/github/issue/list', resource={'repo': 'org/test-repo'})
chain, env = fork_child(parent_chain=[root_ucan], child_ucan_jwt=child_ucan,
                        parent_receipt_id=decision.receipt_id)
subprocess.Popen([sys.executable, 'child.py'], env={**os.environ, **env})
```

### Any other runtime

Use `nomos-ucan` CLI (Bun-compiled binary, `npm i -g @auto-nomos/ucan-cli`):

```bash
nomos-ucan fork --parent-chain ./chain.json --child-jwt $CHILD --parent-receipt-id $RECEIPT
# prints {chain, env} JSON; merge env into child process.
```

## Cedar swarm-safe templates

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

## Audit walking

```bash
# Pull bundle then walk causation chain (printed as a tree, hash chain
# verified per node).
nomos audit-verify --chain ./bundle.json
```

## Limits

- **Chain depth**: capped at `NOMOS_MAX_CHAIN_DEPTH` (default 8). Larger
  swarms must use multiple roots and federate at the application layer.
- **Cross-customer chains**: `swarms.cross_customer_enabled` is a reserved
  design hook (column ships in 0020) — enforcement stays intra-customer
  at launch.
- **Env size**: the chain JSON in `NOMOS_PARENT_UCAN_CHAIN` is bounded by
  OS env-var limits (~128KB on most). Use `NOMOS_PARENT_UCAN_CHAIN_FILE`
  fallback for deep chains with bulky UCANs.

## Status

Phase A (plumbing) + Phase B (UX) shipped behind the `MAOS` umbrella.
Phase C (positioning) deliberately deferred — current README still
markets Nomos as a single-agent auth gateway. Decision on full
repositioning waits on 2-3 design partners running real LangGraph /
CrewAI flows.
