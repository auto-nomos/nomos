# @credential-broker/crypto

Audited cryptographic primitives wrapped for our use. All implementations delegate to `@noble/*` libraries.

## Purpose

The single place where cryptographic operations happen. **Never** roll your own crypto; consume from this package.

## Install (workspace)

```ts
import {
  generateKeypair,
  signDetached,
  verifyDetached,
  didFromPublicKey,
  publicKeyFromDid,
  sha256,
  sha256Hex,
} from '@credential-broker/crypto';
```

## Public API

### Keypairs (`@noble/curves` ed25519)

```ts
const { did, privateKey, publicKey } = generateKeypair();
// did: 'did:key:z6Mk...'

const same = keypairFromPrivate(privateKey);
// did and publicKey match the original
```

### Signatures

```ts
const sig = signDetached(privateKey, payload);    // 64-byte ed25519 signature
const ok  = verifyDetached(publicKey, payload, sig); // boolean
```

`verifyDetached` is fail-safe: returns `false` for wrong-length keys/signatures, malformed bytes, and any synchronous throw from the underlying `@noble` call.

### DID encoding

```ts
const did = didFromPublicKey(publicKey);  // did:key:z6Mk... (ed25519 multicodec 0xed01 + base58btc)
const pub = publicKeyFromDid(did);        // throws on invalid format or non-ed25519 multicodec
```

### Hashing (`@noble/hashes` sha2)

```ts
const digest    = sha256('utf8 string or Uint8Array'); // 32 bytes
const hexString = sha256Hex(input);                    // 64-char lowercase hex
```

## Conventions

- All inputs/outputs use `Uint8Array` for raw bytes.
- DID format is `did:key:` with z-multibase + 0xed01 ed25519 multicodec.
- Strings are encoded as utf-8 before hashing.

## Hard rule

If you find yourself reaching for `crypto.subtle`, `node:crypto`, or rolling a custom JWT/JWS — stop. Add the missing primitive here and use it from there.

## Tests

```bash
pnpm --filter @credential-broker/crypto test
```

100% line+branch+function coverage required, including paths that handle invalid inputs.
