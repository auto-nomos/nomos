# @credential-broker/shared-types

Authoritative Zod schemas + inferred TypeScript types used across every app and package in this monorepo.

## Purpose

A single source of truth for the wire shapes that flow between the dashboard, control plane, PDP, and SDK. If a value moves over the network or persists in Postgres, its shape lives here.

## Install (workspace)

```ts
import { UcanPayload, AuthorizeRequest } from '@credential-broker/shared-types';
```

## Public API

| Module | Exports |
|---|---|
| `did` | `Did`, `DidKey`, `DID_REGEX`, `DID_KEY_REGEX` |
| `ucan` | `UcanPayload`, `UcanIssue`, `Command`, `PolicyPredicate`, `COMMAND_REGEX` |
| `policy` | `Policy`, `PolicyBundle`, `SignedPolicyBundle`, `RevocationEntry`, `RevocationList` |
| `authorize` | `AuthorizeRequest`, `AuthorizeDecision`, `AuthorizeContext`, `DenyReason`, `ReceiptInput` |
| `audit` | `AuditEvent`, `AuditProof`, `AuditDecision` |
| `agent` | `AgentRecord`, `MintUcanInput`, `AgentStatus` |

Each export is both a Zod schema and a type. Use the schema at trust boundaries (HTTP request bodies, queue messages, file reads), use the type elsewhere.

## Conventions

- Snake_case for fields stored in Postgres (`customer_id`, `created_at`).
- camelCase for fields stored only in transit (`receiptId`, `requiresStepUp`).
- All hashes are sha256 hex (regex `/^[0-9a-f]{64}$/`).
- All timestamps are unix milliseconds unless the field name says `_seconds`.
- Schema changes must keep wire compatibility unless paired with an ADR.

## Tests

```bash
pnpm --filter @credential-broker/shared-types test
```

100% line+branch+function coverage required.
