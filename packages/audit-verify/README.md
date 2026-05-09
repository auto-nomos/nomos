# @credential-broker/audit-verify

Standalone CLI + library that verifies a credential-broker audit bundle is
internally consistent and (when present) anchored by a valid signed root.

## CLI

```sh
npx audit-verify --bundle ./audit-export.json --pubkey $AUDIT_VERIFY_KEY
```

Exit codes:

- `0` — bundle is consistent; signed root (if any) verifies.
- `1` — verification failed; details on stderr.
- `2` — usage error (missing flags, unreadable file).

A bundle is the JSON returned by `GET /v1/audit/:eventId/proof` saved to
disk. `--pubkey` may be omitted if `AUDIT_VERIFY_KEY` is set in the
environment.

## Library

```ts
import { verifyBundle } from '@credential-broker/audit-verify';

const result = verifyBundle(bundle, AUDIT_VERIFY_KEY_HEX);
if (!result.ok) {
  console.error(result.errors);
}
```
