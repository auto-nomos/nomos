# SKILL: working in @auto-nomos/cedar

Read this before changing how Cedar policies are parsed or evaluated.

## What this package is for

Cedar policy parsing, evaluation, schema validation, lint. Wraps `@cedar-policy/cedar-wasm` (official AWS Rust SDK as WASM).

## Never

- **Never** call `@cedar-policy/cedar-wasm/nodejs` directly from outside this package. Always go through `cedarBinding` so tests can mock it.
- **Never** swallow errors from Cedar evaluation silently. Bubble them up via `EvaluateResult.errors` so the caller decides how to surface them.
- **Never** trust visual-builder-emitted Cedar without round-tripping through `parsePolicy` and validating the parsed text equals the input modulo formatting. Sprint 7 builds this; the rule predates it.
- **Never** introduce a parallel policy language (Rego, Casbin, custom DSL) without an ADR. Cedar is the single source of truth.
- **Never** mutate the WASM module's exports at runtime. They are frozen ESM exports — `vi.spyOn(cedar, ...)` will fail. That's why `binding.ts` indirects through a plain object.

## Always

- **Always** return `{ ok: true | false, errors: string[] }` shape from validators (`parsePolicy`, `validateSchema`).
- **Always** convert Cedar's failure type to `{ decision: 'deny', errors: [...] }` in `evaluate`. Callers should never have to handle the WASM `type: 'failure'` shape.
- **Always** treat schemas as optional. Cedar runs in lenient mode without a schema; that's expected for Phase 1 (schemas come in Sprint 10).
- **Always** keep `binding.ts` as the only file that imports from `@cedar-policy/cedar-wasm/nodejs`. Tests spy on this object.

## Conventions

- Entity uids: `{ type: 'TypeName', id: 'id' }`. Ids may contain `/` and `_`.
- Cedar action ids include the full command path (e.g., `'/github/issue/create'`).
- For arbitrary key/value resource attributes, route them through `entities[].attrs`. The cast `as unknown as Context` is acceptable at this boundary because `request.resource` is `Record<string, unknown>` by design — the schema (if present) catches type drift; without a schema, we accept best-effort.
- Tests cover all real Cedar behaviors with real WASM. Spy/mock only the failure branch + warnings passthrough that the real WASM does not naturally exercise.

## Coverage

100% line + branch + function coverage. Mocking is acceptable only for paths that real Cedar inputs cannot reach (e.g., `formatPolicies` failure type — Cedar formats anything parseable).

## Phase 2/3 reminder

Browser-side use (visual builder) needs the `esm` build of `@cedar-policy/cedar-wasm`. We import `/nodejs` here for server use; if browser support is added, fork `binding.ts` per environment.
