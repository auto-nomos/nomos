# Org invite flow

Admins (or anyone with `invites:create`) invite teammates by email. The
recipient gets a one-click link that, when opened, either drops them
straight into the org or routes them to signup if they don't already have
a Nomos account.

## Lifecycle

```
+-------------+    +-------------+    +----------+    +---------+
| invites.    |--->| email + raw |--->| recipient|--->| invites.|
| create      |    | token       |    | clicks   |    | accept  |
+-------------+    +-------------+    +----------+    +---------+
                                                            |
                  +-----------------------------------------+
                  |
                  v
              session?
              /   |   \
             yes  yes  no
             |    |    |
        same  diff  needs_signup
        email email
        joined wrong_account
```

## Surface

### `invites.create(email, role)`

- Permission gate: `invites:create`.
- Refuses to create a second pending invite for the same email in the same
  org (`CONFLICT`). Revoke the existing one first if you need to re-issue.
- Generates a 256-bit random token, stores its SHA-256 hash, and hands the
  raw token to the configured `inviteNotifier`.
- Default TTL: 7 days.

### `invites.list()`

- Permission gate: `invites:read`.
- Returns only pending invites (not accepted, not revoked). The `expired`
  flag is true for un-revoked invites past their TTL — the dashboard uses
  this to surface a "resend" affordance.

### `invites.revoke(inviteId)`

- Permission gate: `invites:delete`.
- Sets `revoked_at`. Subsequent `accept` calls with the same token fail with
  `invite revoked`.

### `invites.accept(token)` (public)

- No session required. The mutation has four branches:
  1. **Signed-in + email matches** → `{ status: 'joined', customerId, role }`.
     Membership row is created (or left alone if it already exists).
  2. **Signed-in + email mismatches** → `{ status: 'wrong_account', ... }`.
     UI tells the user to sign out and back in.
  3. **Unauthenticated** → `{ status: 'needs_signup', email, orgName, role }`.
     UI routes to `/sign-up?invite_token=...&email=...`; the new account
     completes signup and re-calls `accept` with the same token.
  4. **Bad state** → throws `NOT_FOUND` (token unknown) or `BAD_REQUEST`
     (already accepted / revoked / expired).

## Notifier

`apps/control-plane/src/services/invites/notify.ts` defines the
`InviteNotifier` type:

```ts
export type InviteNotifier = (n: InviteNotification) => Promise<void>;
```

When wired into `createServer`, prod ships through Knock (or any provider —
the type is provider-agnostic). When the dep is omitted, the control plane
falls back to `loggerInviteNotifier`, which writes a structured pino line
containing the raw token. Useful for dev / test where there's no email
provider; never enable this in prod.

## URL handle

The dashboard's `/accept-invite?token=...` page handles all four branches,
including the redirect to `/sign-up?invite_token=...` for the
`needs_signup` branch. A successful join lands on `/app`.

## Failure modes

| Symptom                                  | Cause                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| `invite not found`                       | Token typo, revoked-and-deleted, or the recipient is on the wrong env.         |
| `invite expired`                         | Past `expires_at`. Re-issue from the Members page.                             |
| `invite already accepted`                | The membership already exists. The user can just open `/app`.                  |
| `a pending invite for that email already exists` | Revoke the old invite first; `revoke + create` is the idiomatic flow. |
