/**
 * Browser-safe subset. Excludes parse.ts and validate.ts because both
 * pull in @cedar-policy/cedar-wasm/nodejs through @credential-broker/cedar
 * (transitively) — Node-only WASM bindings.
 *
 * Browser callers parse Cedar via the server-side `policies.parseToIr`
 * tRPC procedure, and validate emitted Cedar via `policies.preview`.
 * IR → Cedar emission and the IR types themselves are pure JS and live here.
 */
export * from './emit.js';
export * from './ir.js';
