# @auto-nomos/core

The end-to-end authorization decision function. Composes `shared-types` + `crypto` + `ucan` + `cedar` into a single `decide(input)` call.

## Purpose

The PDP runtime imports `decide` and calls it on every authorize request. Same function is reusable in the control plane for policy preview/dry-run.

## Install (workspace)

```ts
import { decide } from '@auto-nomos/core';
```

## Public API

```ts
import { decide } from '@auto-nomos/core';

const decision = decide({
  ucan: jwtOrChain,           // string | string[]  (chain ordered root-first)
  request: {
    ucan: jwtOrChain[0],
    command: '/github/issue/create',
    resource: { repo: 'acme/billing' },
    context: { ip: '1.2.3.4', time: nowMs },
  },
  policies: cedarText,
  revokedCids: new Set(['<sha256-cid-1>']),  // optional
  schema: cedarSchema,                        // optional
  now: 1_700_000_000,                         // optional unix seconds
});
// { allow: boolean, reason?: DenyReason, receiptId, requiresStepUp?, stepUpUrl? }
```

## Decision flow

1. **Validate UCAN chain.** Signature, expiry, nbf, audience continuity, command attenuation.
2. **Revocation check.** Any CID in the chain present in `revokedCids` → deny.
3. **Cedar evaluation.** Build `principal = Agent::"<aud>"`, `action = Action::"<command>"`, `resource = Resource::"__request__"` with attrs from `request.resource`. Evaluate against `policies`.
4. **Build receipt.** `receiptId = sha256(leaf_cid || canonical(request))`.

## Deny reason mapping

| Source | DenyReason |
|---|---|
| Validation: expired | `expired` |
| Validation: not_yet_valid | `not_yet_valid` |
| Validation: bad_signature | `bad_signature` |
| Validation: audience_mismatch | `audience_mismatch` |
| Validation: command_mismatch | `command_mismatch` |
| Validation: malformed/issuer/chain errors | `malformed_ucan` |
| Revoked CID | `revoked` |
| Cedar deny | `policy_denied` |

## Performance

Full flow target: <50ms p99 locally on Node 22 (ARM/x86). Sprint-12 target: <50ms p99 in production load test.

## Tests

```bash
pnpm --filter @auto-nomos/core test
```

100% line+branch+function coverage required. Includes the canonical billing-agent ACME 2026 example, delegation chain, revocation, malformed input, command mismatch, and expired UCAN paths.
