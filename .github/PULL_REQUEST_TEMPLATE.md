## What changed

<!-- 1-3 sentences. Imperative voice. -->

## Why

<!-- The problem this solves or the goal it advances. Link Sprint number / ADR if relevant. -->

## How to test

- [ ] `pnpm install`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm exec biome check .`
- [ ] Manual / e2e: <!-- describe -->

## Multi-tenancy review (if touching control plane)

- [ ] Every Drizzle query includes `customer_id` predicate
- [ ] Every tRPC procedure enforces `ctx.customerId` matches input

## Crypto review (if touching `packages/crypto` or `packages/ucan`)

- [ ] No new use of `crypto.subtle` or `node:crypto` outside `packages/crypto`
- [ ] No bypass of `verifyDetached` / `validateUcan` signature checks
- [ ] Test vectors added for any new algorithm

## Screenshots / logs (UI changes)

<!-- attach -->
