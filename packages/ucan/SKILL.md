# SKILL: working in @auto-nomos/ucan

Read this before changing the UCAN envelope or chain validation.

## What this package is for

Mints and verifies UCANs (compact JWT envelope, UCAN-v1.0 payload). Every authorization decision begins by validating a UCAN here.

## Never

- **Never bypass the signature check.** `validateUcan` and `validateChain` always verify the ed25519 signature *before* returning success. If you find yourself wanting to skip it for "performance" or "tests," stop — write a test fixture with a real signed JWT instead. The whole product collapses if a UCAN is trusted without verification.
- **Never relax attenuation rules** without an ADR. The current rules (action-prefix match, exp-monotone-decreasing, nbf-monotone-increasing, iss=parent.aud) are the security model.
- **Never** introduce non-`did:key:z*` issuers without first wiring the resolution logic. Today, validate fails early on unsupported DID methods (`issuer_unsupported`).
- **Never** mutate the canonical-JSON serialization (`canonicalize`) without bumping the JWT `ucv` header field. Sig-input drift breaks every existing UCAN.
- **Never** add asynchronous side effects to `validateUcan`. It is a pure, sync function. Any I/O (revocation lookup, key resolution) belongs in callers (`packages/core` for the orchestration, the PDP for caches).

## Always

- **Always** treat the leaf UCAN's `aud` as the principal. `iss` of the leaf is "who delegated to this principal," not the principal itself.
- **Always** validate every UCAN in the chain individually before checking inter-link constraints. (One pass over `validateUcan`, then a pass over the attenuation rules.)
- **Always** include error reasons in the result (`{ valid: false, error: '<reason>' }`). Never just `false`.
- **Always** treat UCANs as opaque JSON-bearing strings outside this package. Other packages use `parseUcanJwt` if they need to inspect.

## Conventions

- Wire format: `base64url(canonical(header)).base64url(canonical(payload)).base64url(signature)`.
- Header pinned to `{ alg: "EdDSA", typ: "JWT", ucv: "1.0.0-cb" }`. Any drift bumps `ucv`.
- Chains ordered root-first: `jwts[0]` is the original delegation; `jwts[N-1]` is what the agent presents.
- `expectedCommand` and `audience` options apply only to the *leaf* in `validateChain` (intermediate links are constrained by attenuation rules, not by the request).

## Coverage

100% line + branch + function coverage required. Test every error code path (expired, not_yet_valid, bad_signature, audience_mismatch, command_mismatch, malformed_ucan, issuer_unsupported, broken_delegation, over_attenuated, empty_chain).

## Phase 2/3 reminder

If we add `@ucanto`/CAR-bytes interop or federation across customer PDPs, build it as a separate `packages/ucanto-bridge` adapter — don't replace this package's envelope. See ADR-0002.
