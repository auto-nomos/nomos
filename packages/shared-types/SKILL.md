# SKILL: working in @credential-broker/shared-types

Read this before changing any schema in this package.

## What this package is for

The wire shapes and storage shapes that flow across the system. Everything else depends on these.

## Conventions

- One Zod schema per concept. Export both the schema (for runtime validation) and the inferred type (for compile-time use).
- Schemas live in topic files (`ucan.ts`, `policy.ts`, etc.). `index.ts` re-exports all.
- Snake_case for fields persisted in Postgres. camelCase for ephemeral wire fields.
- Hashes are always sha256 hex (regex `^[0-9a-f]{64}$`).
- Timestamps are unix milliseconds unless the field name ends in `_seconds`.

## Never

- **Never** add fields with `z.any()` or `z.unknown()` at the leaf. Use `z.record(z.string(), z.unknown())` only at named extensibility points (`meta`, `obligations`, `context.catchall`).
- **Never** widen an existing field's accepted values without bumping the schema version and writing an ADR.
- **Never** reach for runtime-only metadata (description strings, default values) in a Zod schema unless those defaults are actually applied at the boundary. Misleading defaults bite later.
- **Never** import non-Zod libraries here. This package is intentionally dependency-light so it can be loaded into any context (browser, Node, edge worker).
- **Never** add side effects on import. The package must be tree-shakable and import-cheap.

## Always

- **Always** add a roundtrip parse/serialize test for every new schema.
- **Always** add a "rejects malformed input" test that asserts the schema rejects a hand-crafted bad payload.
- **Always** export the inferred TypeScript type next to the schema.
- **Always** match the field naming convention used elsewhere in this package.

## Coverage

100% line + branch + function coverage on all schema files (excluding the index re-export). Tests run with `pnpm --filter @credential-broker/shared-types test`.
