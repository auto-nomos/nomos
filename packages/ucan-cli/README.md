# `@auto-nomos/ucan-cli`

`nomos-ucan` — Bun-compiled CLI binary for UCAN minting, verifying, and chain
construction. Used by the Python SDK to keep the crypto path identical to the
TypeScript SDK.

You rarely invoke this directly. It's the unsung hero between `nomos` (Python)
and the cryptographic guarantees the platform makes.

## Install

```bash
npm i -g @auto-nomos/ucan-cli
# or:
pnpm dlx @auto-nomos/ucan-cli <command>
```

Single static binary, ~10MB. No Node runtime dependency at execution time
(compiled with Bun's static-link).

## Commands

```bash
nomos-ucan mint  --issuer ./issuer.json --audience did:key:z6Mk… \
                 --capability 'github://acme/app|repo:read' \
                 --ttl 300

nomos-ucan verify --jwt <ucan-jwt> --pubkey <ed25519-pubkey-hex>

nomos-ucan chain  --parent <root-jwt> --child <child-jwt>
                  # writes JSON: { chain: [...], depth: N, valid: true }

nomos-ucan keypair                  # generate fresh ed25519 keypair JSON
```

## Why a separate binary

The Python SDK needs to mint UCANs whose bytes the TypeScript-implemented PDP can
verify. Re-implementing Ed25519 + JWT bit-perfect across languages is a slow,
risky path. Compiling the TS reference path into a binary that Python shells out
to gives us:

- Same canonicalization, same signature bytes.
- One audited crypto surface.
- Easy upgrades — bump the binary, both SDKs follow.

## Output format

`mint` outputs:

```json
{
  "jwt": "eyJhbGciOiJFZERTQSIs…",
  "cid": "bafyrei…",
  "audience": "did:key:z6Mk…",
  "expiresAt": "2026-05-23T18:12:00.000Z"
}
```

`verify` outputs:

```json
{ "valid": true, "iss": "did:key:…", "aud": "did:key:…", "att": [...] }
```

## Used by

- [`nomos` Python SDK](../sdk-python/) — `mint_ucan`, `verify_ucan`, `fork_child`.
- `cb` CLI — `cb policy simulate` calls the verifier.
- Some internal tests — to exercise the boundary path.

## Docs

Live docs: [docs.auto-nomos.com/policies/swarm-delegation](https://app.auto-nomos.com/docs/policies/swarm-delegation)
