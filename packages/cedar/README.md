# @credential-broker/cedar

Cedar policy parsing, evaluation, lint, and schema validation. Wraps `@cedar-policy/cedar-wasm` (the official AWS Rust SDK as WASM).

## Purpose

The PDP and control plane need to parse Cedar policy text, evaluate authorization requests against it, validate schemas, and lint policy text. This package centralizes that surface.

## Install (workspace)

```ts
import { parsePolicy, evaluate, validateSchema, lintPolicy } from '@credential-broker/cedar';
```

## Public API

### Parse

```ts
const result = parsePolicy('permit(principal, action, resource);');
// { ok: true, errors: [] } | { ok: false, errors: DetailedError[] }
```

### Evaluate

```ts
const result = evaluate({
  policies: 'permit(principal in Group::"admins", action, resource);',
  principal: { type: 'User', id: 'alice' },
  action: { type: 'Action', id: 'read' },
  resource: { type: 'Document', id: 'doc1' },
  context: { hour: 14 },
  entities: [
    {
      uid: { type: 'User', id: 'alice' },
      attrs: {},
      parents: [{ type: 'Group', id: 'admins' }],
    },
  ],
  schema: optionalCedarSchema,
});
// { decision: 'allow' | 'deny', reason: PolicyId[], errors: string[], warnings: string[] }
```

A failure inside Cedar (malformed policy, schema mismatch) is normalized to `{ decision: 'deny', errors: [...] }` so callers always get a usable result.

### Validate schema

```ts
const result = validateSchema(jsonOrCedarSchemaText);
// { ok: true, errors: [] } | { ok: false, errors: string[] }
```

Accepts both JSON and Cedar-syntax schema text.

### Lint

```ts
const result = lintPolicy(text);
// { ok: boolean, warnings: { type: 'parse' | 'format', message: string }[] }
```

A `format` warning means the text parses but doesn't match Cedar's preferred formatting; running through the formatter would normalize it.

## Conventions

- Cedar entity uids: `{ type: 'TypeName', id: 'id' }`.
- Action ids may contain `/` (e.g., `'/github/issue/create'`).
- Schema is optional; without one, Cedar runs in lenient mode.
- Internal indirection through `binding.ts` allows test-time spying on the WASM exports (ESM modules are otherwise frozen).

## Tests

```bash
pnpm --filter @credential-broker/cedar test
```

100% line+branch+function coverage required.
