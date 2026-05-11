# @auto-nomos/policy-builder

Visual editor for Cedar policies. React Flow canvas + Cedar AST round-trip.

## Surface

```ts
import { parseToIr, roundTrip } from '@auto-nomos/policy-builder';
import { PolicyBuilder } from '@auto-nomos/policy-builder/components';
```

- `parseToIr(cedarText)` — split a policy set, convert each policy to the
  internal `VisualPolicy` IR, return `{ policies, unrepresentable }`.
- `roundTrip(policies)` — emit Cedar text, re-parse via
  `@auto-nomos/cedar`, return `{ ok, cedarText, errors? }`.
- `<PolicyBuilder policy onChange />` — React Flow surface; one canvas per
  policy. Designed to live inside the dashboard's Visual tab on
  `/app/policies/[id]`.

## IR scope

The IR is intentionally narrow. It models the shapes that the templates
ship and the common patterns customers will hand-edit. Anything outside
the IR (extension functions, arithmetic on the LHS of a comparison,
`like`/`is in <entity>` chains) is reported via `unrepresentable` so the
dashboard can surface "this policy is too complex for the visual builder
— edit in Cedar" without losing the user's source.

## Round-trip guarantee

`roundTrip(policies)` is the single integrity gate. Saving a Visual-tab
edit goes:

1. IR → emit → Cedar text
2. Cedar text → `@auto-nomos/cedar.parsePolicy` → ok / errors
3. If ok, save through the existing `policies.upsert` tRPC mutation; if
   not, surface the parser errors next to the canvas and reject save.

Any new IR shape MUST add a fixture to `__tests__/roundtrip.test.ts`.
