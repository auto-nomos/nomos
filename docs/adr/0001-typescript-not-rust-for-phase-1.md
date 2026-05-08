# 0001. TypeScript (not Rust) for Phase 1

Date: 2026-05-09
Status: accepted

## Context

The PDP is the hot path: every agent action runs through it. Sub-50ms p99 is a Phase 1 goal. Rust would deliver lower latency and tighter memory footprint than Node, and a Rust PDP is a credible Phase 2 path (we already use Cedar's Rust SDK via WASM).

We have one engineer + Claude Code building this. The MCP wedge needs to ship in 24 weeks with 10 paying design partners.

## Decision

Build all of Phase 1 in TypeScript on Node.js 22 LTS.

## Consequences

**Positive:**
- One language across PDP, control plane, dashboard, SDK, and shared types. Refactors are mechanical, types flow end-to-end via tRPC + Zod.
- Largest UCAN + Cedar ecosystem is in TypeScript/JavaScript. `@cedar-policy/cedar-wasm` ships official AWS bindings; `@noble/curves` is audited and Node-native.
- Claude Code is fastest and most reliable in TypeScript. We pay for that productivity in capability, not in latency.
- New SDK consumers (MCP server developers) are overwhelmingly Node/Python first. Sharing a runtime with them simplifies docs and debugging.

**Negative:**
- p99 floor is higher in Node than Rust. Cedar evaluation is sub-millisecond either way; the rest is ed25519 + JSON + I/O. We accept the gap.
- Memory per-PDP-instance is higher (Node + V8 vs. a Rust binary). At Phase 1 scale this is invisible on Fly.io shared CPU.

## Alternatives considered

- **Rust + Hyper.** Best raw performance, hardest devx for one engineer + Claude Code. Adds compilation overhead per change, fragments the ecosystem, and forces a context switch on every cross-app refactor. Phase 2 reconsiders this for the PDP only — control plane stays TypeScript.
- **Go + Chi.** Compromises in both directions: not as fast as Rust, not as type-rich as TypeScript, and weaker UCAN/Cedar ecosystem support. Pass.
- **Bun.** Faster than Node and TypeScript-native. Still maturing in some `@noble`/`@cedar-policy` corners. Hono on Bun is a Phase 2 option (we lose nothing because Hono runs everywhere).

## Phase 2 trigger

If steady-state PDP p99 exceeds 50ms after the Sprint-12 hardening pass, port the hot path of `decide()` to a Rust binary fronted by Hono. Plumbing already isolates the function; the swap is mechanical.
