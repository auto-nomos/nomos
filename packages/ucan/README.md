# @credential-broker/ucan

UCAN-v1.0 JWT envelope (issue, validate, chain) built on `@credential-broker/crypto`.

## Purpose

Mints and verifies UCANs that flow between agents and our PDP. Issues a UCAN as a compact JWT (`header.payload.signature`); validates signature, expiry, audience, command, and full delegation chains.

## Install (workspace)

```ts
import { issueUcan, validateUcan, validateChain, computeCid } from '@credential-broker/ucan';
```

## Public API

### Issuing

```ts
const { cid, jwt, payload } = issueUcan({
  payload: {
    iss: signerDid,
    aud: agentDid,
    cmd: '/github/issue/create',
    pol: [['==', '.repo', 'acme/billing']],
    nonce: 'abc',
    nbf: nowSeconds,
    exp: nowSeconds + 3600,
  },
  privateKey: signerPrivateKey,
});
```

### Validating one UCAN

```ts
const result = validateUcan(jwt, {
  audience: agentDid,                  // optional, enforced if provided
  expectedCommand: '/github/issue/create', // optional; checks attenuation
  now: 1_700_000_000,                  // optional override (Date.now() default)
});
// { valid: true, payload } | { valid: false, error: ValidationError }
```

`ValidationError` is one of: `malformed_ucan`, `bad_signature`, `expired`, `not_yet_valid`, `audience_mismatch`, `command_mismatch`, `issuer_unsupported`.

### Validating a delegation chain

```ts
const chainResult = validateChain([rootJwt, midJwt, leafJwt], {
  audience: leafAudienceDid,
  expectedCommand: '/github/issue/create',
  now,
});
// { valid: true, root, leaf } | { valid: false, error: ChainError }
```

Chains must be ordered root-first. Rules enforced:
- Each child's `iss` equals the previous parent's `aud`.
- Each child's `cmd` is at-or-below the parent's (`actionMatchesGranted`).
- Each child's `exp` is ≤ parent's.
- Each child's `nbf` is ≥ parent's.

### Helpers

```ts
const cid = computeCid(jwt);                   // sha256-hex content id
const ok  = actionMatchesGranted(granted, action);
const parsed = parseUcanJwt(jwt);              // parse without verifying signature (chain inspection)
const enc = canonicalize(value);               // deterministic JSON for signing input
const b64 = bytesToBase64url(bytes);           // jwt-style base64url (Node Buffer)
```

## Conventions

- Wire format: `base64url(canonical(header)).base64url(canonical(payload)).base64url(signature)`
- Header: `{ alg: "EdDSA", typ: "JWT", ucv: "1.0.0-cb" }`
- Signature input: utf-8 of `<headerEnc>.<payloadEnc>`, ed25519
- Issuer DID must be a `did:key:z*` (ed25519); other DID methods deferred to Phase 2

## Notes

- See [ADR-0002](../../docs/adr/0002-thin-ucan-jwt-envelope.md) for why we use a thin custom envelope rather than `@ucanto`.
- `@ucanto` interop (CAR-encoded DAG-CBOR with the Storacha network) is deferred to Phase 2 if we need cross-network UCAN exchange.

## Tests

```bash
pnpm --filter @credential-broker/ucan test
```

100% line+branch+function coverage required.
