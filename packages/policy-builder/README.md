# `@auto-nomos/policy-builder`

Visual editor for Cedar policies. React Flow canvas + Cedar AST round-trip.
Powers the **Visual** tab on `/app/policies/<id>` in the Nomos dashboard.

You'd use this package directly only if you're embedding policy editing in your
own product. Most users use the visual builder inside the Nomos dashboard.

## Install

```bash
pnpm add @auto-nomos/policy-builder
```

Peer deps: React 18+, `@xyflow/react`, `@auto-nomos/cedar`.

## API

```ts
import { parseToIr, roundTrip } from '@auto-nomos/policy-builder';
import { PolicyBuilder } from '@auto-nomos/policy-builder/components';
```

| Export | What |
|---|---|
| `parseToIr(cedarText)` | Split policy set → internal `VisualPolicy` IR. Returns `{ policies, unrepresentable }`. |
| `emit(policies)` | IR → Cedar text. Inverse of `parseToIr`. |
| `roundTrip(policies)` | `emit` + re-parse via `@auto-nomos/cedar.parsePolicy`. Returns `{ ok, cedarText, errors? }`. |
| `<PolicyBuilder policy onChange />` | React Flow canvas. One canvas per policy. |

## Round-trip guarantee

`roundTrip(policies)` is the single integrity gate. Saving a Visual-tab edit goes:

1. IR → emit → Cedar text.
2. Cedar text → `@auto-nomos/cedar.parsePolicy` → ok / errors.
3. If ok, save through your storage; if not, surface the parser errors next to the
   canvas and reject save.

This means **the visual representation can never silently diverge from the actual
Cedar that runs**. A bug in the emitter shows up as a failed save with a diff
message, not as a policy that allows actions the user thought were forbidden.

## IR scope

The IR is intentionally narrow. It models:

- `permit` and `forbid` statements with `principal`, `action`, `resource`.
- `when` and `unless` clauses with equality, `in`, `like`, boolean conjunctions.
- `context.cosigner`, `context.now.*`, `context.envelope_active`, `context.ip`.
- `principal.delegationDepth`, `principal.rootAgent`, `principal.invokedBy`.

Anything outside the IR (extension functions, arithmetic on the LHS of a
comparison, `is in <entity>` chains) is reported via `unrepresentable` so the
dashboard can surface "this policy is too complex for the visual builder — edit
in Cedar" without losing the user's source.

## Adding a new IR shape

1. Add the shape to `src/ir.ts` (zod-defined).
2. Implement parse in `src/parse.ts` (Cedar AST → IR node).
3. Implement emit in `src/emit.ts` (IR node → Cedar source).
4. Add a fixture to `__tests__/roundtrip.test.ts`. Anything you can't round-trip
   isn't shipped.

## Embedding example

```tsx
'use client';

import { useState } from 'react';
import { parseToIr, roundTrip, PolicyBuilder } from '@auto-nomos/policy-builder/components';

export function MyEditor({ initialCedar }: { initialCedar: string }) {
  const { policies } = parseToIr(initialCedar);
  const [draft, setDraft] = useState(policies);

  const handleSave = async () => {
    const result = roundTrip(draft);
    if (!result.ok) {
      alert(`round-trip failed: ${result.errors.join(', ')}`);
      return;
    }
    await fetch('/api/policy', {
      method: 'PUT',
      body: result.cedarText,
    });
  };

  return (
    <>
      <PolicyBuilder policies={draft} onChange={setDraft} />
      <button onClick={handleSave}>Save</button>
    </>
  );
}
```

## Docs

Live docs: [docs.auto-nomos.com/policies/visual-builder](https://app.auto-nomos.com/docs/policies/visual-builder)
Cedar syntax: [docs.auto-nomos.com/policies/cedar-syntax](https://app.auto-nomos.com/docs/policies/cedar-syntax)
