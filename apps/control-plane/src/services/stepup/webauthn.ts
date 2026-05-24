/**
 * Step-up WebAuthn assertion against the unified `passkey` table.
 *
 * Enrollment is owned by Better-Auth's passkey plugin (`/auth/passkey/*`).
 * Step-up only needs to ASSERT against an already-enrolled credential, so
 * `registrationOptions` / `verifyRegistration` are no longer here — they
 * lived in the legacy hand-rolled flow before unification.
 *
 * Challenges live in an in-memory Map with a 5-minute TTL (single-process
 * control plane). Phase 2 multi-instance deploy needs Redis or a pg row,
 * but Better-Auth's plugin uses the `verification` table for the *login*
 * flow which is already multi-process safe; the step-up challenge surface
 * is the only piece still in-memory.
 *
 * Origin / RP id come from `DASHBOARD_PUBLIC_URL`. WebAuthn requires the
 * relying-party id to be a registrable domain (or "localhost" in dev).
 */

import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { and, eq } from 'drizzle-orm';
import type { DrizzleClient } from '../../db/index.js';
import * as schema from '../../db/schema.js';

export interface WebAuthnConfig {
  rpId: string;
  rpName: string;
  origin: string;
}

const CHALLENGE_TTL_MS = 5 * 60 * 1_000;

interface ChallengeEntry {
  challenge: string;
  expiresAt: number;
}

const challengeStore = new Map<string, ChallengeEntry>();

/**
 * Audit C4 (downgraded HIGH) — the key includes `originalUcanCid` so a
 * challenge issued for approval row in state S(t0) is unusable if anything
 * mutates the row's bound UCAN CID before verify lands. Without this pin
 * an attacker with DB-write access (or any code path that can swap
 * `original_ucan_cid` between authenticationOptions and verifyAuthentication)
 * could swap the target request while the user's passkey assertion stays
 * valid. Legacy rows where originalUcanCid is null fall back to the empty
 * sentinel so the existing per-approval pin still applies.
 */
function challengeKey(userId: string, approvalId: string, originalUcanCid: string | null): string {
  return `${userId}|assert|${approvalId}|${originalUcanCid ?? ''}`;
}

async function loadApprovalCid(db: DrizzleClient, approvalId: string): Promise<string | null> {
  const row = await db
    .select({ originalUcanCid: schema.pushApprovals.originalUcanCid })
    .from(schema.pushApprovals)
    .where(eq(schema.pushApprovals.id, approvalId))
    .limit(1);
  return row[0]?.originalUcanCid ?? null;
}

function setChallenge(key: string, challenge: string): void {
  challengeStore.set(key, { challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS });
}

function takeChallenge(key: string): string | undefined {
  const entry = challengeStore.get(key);
  if (!entry) return undefined;
  challengeStore.delete(key);
  if (entry.expiresAt <= Date.now()) return undefined;
  return entry.challenge;
}

/** Drops expired entries — defensive against memory growth. */
export function sweepWebAuthnChallenges(now: number = Date.now()): number {
  let dropped = 0;
  for (const [key, entry] of challengeStore.entries()) {
    if (entry.expiresAt <= now) {
      challengeStore.delete(key);
      dropped++;
    }
  }
  return dropped;
}

/** Test-only: lets specs reset state between cases. */
export function _resetWebAuthnChallenges(): void {
  challengeStore.clear();
}

export function deriveWebAuthnConfig(dashboardPublicUrl: string, rpName = 'Nomos'): WebAuthnConfig {
  const url = new URL(dashboardPublicUrl);
  const origin = url.origin;
  const rpId = url.hostname;
  return { rpId, rpName, origin };
}

export async function authenticationOptions(args: {
  userId: string;
  approvalId: string;
  config: WebAuthnConfig;
  db: DrizzleClient;
}): Promise<{
  options: Awaited<ReturnType<typeof generateAuthenticationOptions>>;
  hasCredentials: boolean;
}> {
  const creds = await args.db
    .select({ credentialID: schema.passkey.credentialID })
    .from(schema.passkey)
    .where(eq(schema.passkey.userId, args.userId));
  const options = await generateAuthenticationOptions({
    rpID: args.config.rpId,
    allowCredentials: creds.map((c) => ({
      id: c.credentialID,
      transports: ['internal', 'hybrid'],
    })),
    userVerification: 'required',
  });
  const cid = await loadApprovalCid(args.db, args.approvalId);
  setChallenge(challengeKey(args.userId, args.approvalId, cid), options.challenge);
  return { options, hasCredentials: creds.length > 0 };
}

export async function verifyAuthentication(args: {
  userId: string;
  approvalId: string;
  response: AuthenticationResponseJSON;
  config: WebAuthnConfig;
  db: DrizzleClient;
}): Promise<{ ok: boolean }> {
  // Audit C4 — re-derive the challenge key from the approval row as it
  // exists *now*. If `original_ucan_cid` was mutated between options and
  // verify, the key differs and takeChallenge returns undefined → fail.
  const cid = await loadApprovalCid(args.db, args.approvalId);
  const expected = takeChallenge(challengeKey(args.userId, args.approvalId, cid));
  if (!expected) return { ok: false };
  const credentialID = args.response.id;

  // Audit M10 (2026-05-24) — wrap read + verify + counter-update in a
  // transaction with SELECT … FOR UPDATE so concurrent assertions can't both
  // read the old counter, both verify, and both write counter+1 (lost
  // increment → replay window). Also assert monotonicity defensively in
  // case the @simplewebauthn check is ever relaxed.
  return args.db.transaction(async (tx) => {
    const [stored] = await tx
      .select()
      .from(schema.passkey)
      .where(
        and(eq(schema.passkey.userId, args.userId), eq(schema.passkey.credentialID, credentialID)),
      )
      .for('update')
      .limit(1);
    if (!stored) return { ok: false };
    const publicKey = new Uint8Array(Buffer.from(stored.publicKey, 'base64url'));
    const verification = await verifyAuthenticationResponse({
      response: args.response,
      expectedChallenge: expected,
      expectedOrigin: args.config.origin,
      expectedRPID: args.config.rpId,
      requireUserVerification: true,
      credential: {
        id: stored.credentialID,
        publicKey,
        counter: stored.counter,
      },
    });
    if (!verification.verified) return { ok: false };
    const newCounter = verification.authenticationInfo.newCounter;
    // Authenticators that emit counter 0 advertise "no signCount" — accept
    // unchanged; otherwise require strict monotonic increase.
    if (newCounter !== 0 && newCounter <= stored.counter) {
      return { ok: false };
    }
    await tx
      .update(schema.passkey)
      .set({ counter: newCounter })
      .where(eq(schema.passkey.id, stored.id));
    return { ok: true };
  });
}
