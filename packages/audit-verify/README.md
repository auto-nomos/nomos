# `@auto-nomos/audit-verify`

Standalone CLI + library that verifies a Nomos audit proof bundle is internally
consistent and anchored by a valid signed root. No network calls — auditors can
run it offline.

## Install

```bash
pnpm dlx @auto-nomos/audit-verify --help
# or globally:
pnpm add -g @auto-nomos/audit-verify
audit-verify --help
```

## Verify one event

```bash
audit-verify \
  --bundle ./event-92ab.json \
  --pubkey $AUDIT_VERIFY_KEY
```

Output:

```
event   id        evt_01J7K…
chain   verified  9 events
root    signed    2026-05-23T00:00:00Z  by did:key:z6Mk…
result  OK
```

`--pubkey` may be omitted if `AUDIT_VERIFY_KEY` is set in the environment.

## Verify a chain

```bash
audit-verify \
  --chain ./writer-receipt-chain.json \
  --pubkey $AUDIT_VERIFY_KEY
```

Walks a swarm receipt tree:

```
OK: 3 events, hash chain verified.

ALLOW github://acme/app agent=planner    depth=0 id=8c1f…
└── ALLOW github://acme/app agent=researcher depth=1 id=92ab…
    └── STEPUP github://acme/app agent=writer depth=2 id=7fde…
```

## Verify a daily root

```bash
audit-verify \
  --root ./root-2026-05-22.json \
  --pubkey $AUDIT_VERIFY_KEY
```

Confirms the root's signature matches the supplied pubkey and the root's hash
matches the canonical SHA-256 of the event window it covers.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Bundle is consistent; signed root (if present) verifies. |
| `1` | Verification failed; details on stderr. |
| `2` | Usage error (missing flags, unreadable file). |

## Library API

```ts
import { verifyBundle, verifyChain, verifyRoot } from '@auto-nomos/audit-verify';

const result = verifyBundle(bundle, auditVerifyKeyHex);
if (!result.ok) {
  console.error(result.errors);
}
```

| Function | Input | Returns |
|---|---|---|
| `verifyBundle(bundle, pubkey)` | One event + chain + root | `{ ok, errors[], eventId, rootId }` |
| `verifyChain(chain, pubkey)` | Multi-receipt swarm bundle | `{ ok, errors[], depth, agents[] }` |
| `verifyRoot(root, pubkey)` | Signed daily root | `{ ok, errors[], window }` |

## Use in CI

```yaml
- name: verify audit proof
  run: |
    pnpm dlx @auto-nomos/audit-verify \
      --bundle ./build/audit-proof.json \
      --pubkey ${{ secrets.AUDIT_VERIFY_KEY }}
```

The CLI exit code drives the job result. Use this if you ship audit proofs as
attestations alongside releases or compliance reports.

## Download a proof bundle

From the dashboard's audit table: click any row → **Download proof** in the drawer.

From the API:

```bash
curl https://control.auto-nomos.com/v1/audit/<eventId>/proof \
  -H "authorization: Bearer $NOMOS_API_KEY" \
  > event.json
```

## Docs

Live docs: [docs.auto-nomos.com/operate/audit-verify-cli](https://app.auto-nomos.com/docs/operate/audit-verify-cli)
Audit chain primer: [docs.auto-nomos.com/operate/audit-chain](https://app.auto-nomos.com/docs/operate/audit-chain)
