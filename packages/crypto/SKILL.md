# SKILL: working in @credential-broker/crypto

Read this before touching anything in this package.

## What this package is for

The single chokepoint for cryptographic operations across the system. Every signature, hash, keypair, and DID encoding the platform produces flows through here.

## Never

- **Never invent crypto.** Do not write your own ed25519, your own SHA, your own multibase, your own JWT signer. If you find yourself reaching for `crypto.subtle`, `node:crypto`, or a custom byte-twiddling routine, stop. Use `@noble/curves`, `@noble/hashes`, and `multiformats` instead.
- **Never weaken** existing input validation. The 32-byte length checks and `try/catch` defenses on `verifyDetached` are deliberate. Removing them creates panics on malformed inputs in production.
- **Never log keys.** Private keys never leave this package's call sites. Console-logging or pushing them through OTel spans is a P0 incident.
- **Never** add `Math.random()`-based randomness. Use the libraries' CSPRNG.
- **Never** roll a new DID method without an ADR. did:key (ed25519, multicodec 0xed01) is the only supported method in Phase 1.

## Always

- **Always** treat raw bytes as `Uint8Array`. Don't accept `Buffer` in public APIs (works in Node, breaks in browsers).
- **Always** add a roundtrip test (encode → decode → equal) for any new encoding.
- **Always** add a NIST/RFC test vector for any new hash or signature algorithm.
- **Always** keep the public API small and orthogonal.

## Conventions

- Function-level fail-safety: invalid lengths return `false` (verify) or throw `Error` with a message that names the field. Never silently accept malformed input.
- Defensive `try/catch` around upstream library calls is allowed and tested.
- The `@noble` libraries are pinned to exact versions in `package.json`; bumping them requires running the full test suite plus visual review of the lockfile diff.

## Coverage

100% line + branch + function coverage on all source files (excluding the index re-export). Tests use real crypto (no mocks for `@noble` itself); spy + mock only when a defensive path is otherwise unreachable.
