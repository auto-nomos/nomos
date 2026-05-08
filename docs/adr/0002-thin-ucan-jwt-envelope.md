# 0002. Thin UCAN-v1.0 JWT envelope (not @ucanto in Phase 1)

Date: 2026-05-09
Status: accepted

## Context

The Phase 1 plan called for adopting `@ucanto/core` as the UCAN library because it is "production-tested, Storacha-at-scale, audited." On closer inspection, `@ucanto` implements UCAN v0.10's capability-DSL with CAR-encoded DAG-CBOR delegations. Our spec section 5.1 prescribes a UCAN v1.0 payload shape (`iss`, `aud`, `cmd`, `pol`, `nonce`, `nbf`, `exp`, `prf`).

The two are incompatible without writing a translation layer that erases most of `@ucanto`'s value.

We also need the wire format to be a compact string the SDK can put in an HTTP header — `@ucanto`'s native CAR-bytes shape forces base64-encoding the binary blob, adding length and friction.

## Decision

Phase 1 implements a thin UCAN-v1.0 JWT envelope in `packages/ucan` built directly on `@credential-broker/crypto` (`@noble/curves` ed25519 + sha256). The envelope is compact JWT: `base64url(canonical(header)).base64url(canonical(payload)).base64url(signature)`. Signature is detached ed25519 over the utf-8 of `header.payload`. Content ID is sha256-hex of the full JWT.

We do **not** roll our own crypto — the underlying primitives come from audited `@noble` libraries. We do roll our own *envelope*, which is straight JWT.

## Consequences

**Positive:**
- Aligned with the spec's UCAN v1.0 payload shape. No translation tax.
- Compact wire format (base64url-only). Fits in HTTP headers.
- Two days of work, fully tested at 100% line/branch/function coverage. `@ucanto` integration would have taken weeks plus an ongoing translation layer.
- We control attenuation rules (`actionMatchesGranted`) directly — no surprises from upstream API drift.

**Negative:**
- We have to maintain the envelope ourselves. Mitigated by keeping the package small (~120 SLOC) and 100% test-covered, including chain attenuation rules.
- We are not interoperable with the Storacha network out of the box. Acceptable for Phase 1 — the network effect there is not on our roadmap until Phase 4.
- Cross-customer UCAN exchange (federation, Phase 3+) will need a wire-format adapter. Plumbing reserved.

## Alternatives considered

- **`@ucanto/core` with translation.** Would force a UCAN v0.10 ↔ v1.0 mapping layer that handles CAR-bytes ↔ JWT, capability-DSL ↔ command-string, and a different chain-validation model. Months of unplanned work for value we don't need until Phase 4.
- **`jose` library + custom UCAN payload.** Adds a dependency for what is a 50-line JWT encoder/decoder. The crypto already lives in `@noble`. Skipped.
- **Pure DAG-CBOR over HTTP.** Saves bytes vs. base64url JSON but loses inspectability and forces every consumer to bring a CBOR decoder. Defer to Phase 3 if bandwidth becomes the bottleneck.

## Phase 2/3 trigger

If we need Storacha-network interop, federated UCAN trust, or CBOR-on-the-wire bandwidth wins, add a `packages/ucanto-bridge` that converts between our envelope and `@ucanto`'s CAR shape. Don't replace the envelope.
