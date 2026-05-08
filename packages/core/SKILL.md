# SKILL: working in @credential-broker/core

Read this before changing the `decide()` function.

## What this package is for

The end-to-end authorization decision: UCAN chain validation → revocation check → Cedar evaluation → AuthorizeDecision. The PDP runtime imports `decide` and calls it on every request. The control plane uses the same function for policy preview/dry-run.

## Never

- **Never** change the order of validation steps without an ADR. The order matters: (1) signature/expiry/chain, (2) revocation, (3) Cedar. Reordering creates information leaks (e.g., "your UCAN is revoked" leaking before signature check).
- **Never** swallow errors from sub-validators. Every failure path must produce a `DenyReason` from the shared-types enum.
- **Never** add I/O to `decide`. It is sync and pure (modulo `Date.now()` defaults). Revocation lists, policy bundles, and schemas are inputs. Async loading happens in the PDP cache layer.
- **Never** issue side effects from `decide` (no audit emit, no metric, no log). Those are the caller's job. Keeping `decide` pure makes it trivial to dry-run in the dashboard preview.
- **Never** introduce a "fail-open" mode here. The PDP-side fail-open vs fail-closed decision lives in the SDK or PDP server (per D-3, default closed). `decide` only knows allow/deny based on inputs.

## Always

- **Always** map every chain/validation error to a `DenyReason`. The mapping is in `CHAIN_ERROR_TO_REASON`.
- **Always** generate a stable `receiptId` (`sha256(leaf_cid || canonical(request))`) so callers can dedupe. Even on deny.
- **Always** check revocation against the *full chain*, not just the leaf. Any revoked link breaks the chain.
- **Always** keep the Cedar entity layout consistent: principal=`Agent::"<aud>"`, action=`Action::"<command>"`, resource=`Resource::"__request__"`. Schema packs that override this must be wired into the `entities` array, not by changing this convention.

## Conventions

- Inputs: `ucan` is `string | string[]`. Single string is a leaf-only chain. Arrays are root-first.
- `revokedCids` is a `ReadonlySet<string>` of sha256-hex CIDs; `undefined` skips the check.
- `now` defaults to `Math.floor(Date.now() / 1000)` (unix seconds). Tests inject deterministic values.

## Coverage

100% line + branch + function coverage. Integration tests are real end-to-end (no mocks): `issueUcan` → `decide` → assert decision.

## Performance

Target: <50ms p99 locally for the full flow. Use `performance.now()` deltas in tests where latency matters. If a regression appears, profile UCAN signature verify (usually the dominant cost) before optimizing Cedar.
