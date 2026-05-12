/**
 * Sprint 9 — WebAuthn / passkey wrapper for the step-up approval flow.
 *
 * The dashboard /approve/:id page calls these procedures via tRPC:
 *   1. registerOptions / registerVerify  — first-time passkey registration.
 *   2. assertOptions  / assertVerify     — biometric approval of a step-up.
 *
 * Challenges live in an in-memory Map with a 5-minute TTL. Single-process
 * control plane in Phase 1 makes this acceptable; Phase 2 multi-instance
 * deploy needs Redis or a pg row.
 *
 * Origin / RP id come from `DASHBOARD_PUBLIC_URL`. WebAuthn requires the
 * relying-party id to be a registrable domain (or "localhost" in dev).
 */

import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
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

function challengeKey(userId: string, kind: 'register' | 'assert', tag: string): string {
  return `${userId}|${kind}|${tag}`;
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

export function deriveWebAuthnConfig(
  dashboardPublicUrl: string,
  rpName = 'credential-broker',
): WebAuthnConfig {
  const url = new URL(dashboardPublicUrl);
  const origin = url.origin;
  const rpId = url.hostname;
  return { rpId, rpName, origin };
}

export async function registrationOptions(args: {
  userId: string;
  userName: string;
  config: WebAuthnConfig;
  db: DrizzleClient;
}): Promise<{
  options: ReturnType<typeof generateRegistrationOptions> extends Promise<infer T> ? T : never;
  key: string;
}> {
  const existing = await args.db
    .select({ credentialId: schema.webauthnCredentials.credentialId })
    .from(schema.webauthnCredentials)
    .where(eq(schema.webauthnCredentials.userId, args.userId));
  const userIdBytes = Buffer.from(args.userId, 'utf8');
  const options = await generateRegistrationOptions({
    rpID: args.config.rpId,
    rpName: args.config.rpName,
    userName: args.userName,
    userID: new Uint8Array(userIdBytes),
    attestationType: 'none',
    excludeCredentials: existing.map((e) => ({
      id: e.credentialId,
      transports: ['internal', 'hybrid'],
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });
  const key = challengeKey(args.userId, 'register', 'main');
  setChallenge(key, options.challenge);
  return { options, key };
}

export async function verifyRegistration(args: {
  userId: string;
  response: RegistrationResponseJSON;
  config: WebAuthnConfig;
  db: DrizzleClient;
  name?: string;
}): Promise<{ ok: boolean; credentialId?: string }> {
  const expected = takeChallenge(challengeKey(args.userId, 'register', 'main'));
  if (!expected) {
    return { ok: false };
  }
  const verification = await verifyRegistrationResponse({
    response: args.response,
    expectedChallenge: expected,
    expectedOrigin: args.config.origin,
    expectedRPID: args.config.rpId,
    requireUserVerification: false,
  });
  if (!verification.verified || !verification.registrationInfo) {
    return { ok: false };
  }
  const info = verification.registrationInfo;
  const credentialId = info.credential.id;
  await args.db.insert(schema.webauthnCredentials).values({
    userId: args.userId,
    credentialId,
    publicKey: Buffer.from(info.credential.publicKey).toString('base64url'),
    counter: info.credential.counter,
    transports: args.response.response.transports?.join(',') ?? null,
    name: args.name ?? null,
  });
  return { ok: true, credentialId };
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
    .select({ credentialId: schema.webauthnCredentials.credentialId })
    .from(schema.webauthnCredentials)
    .where(eq(schema.webauthnCredentials.userId, args.userId));
  const options = await generateAuthenticationOptions({
    rpID: args.config.rpId,
    allowCredentials: creds.map((c) => ({
      id: c.credentialId,
      transports: ['internal', 'hybrid'],
    })),
    userVerification: 'preferred',
  });
  setChallenge(challengeKey(args.userId, 'assert', args.approvalId), options.challenge);
  return { options, hasCredentials: creds.length > 0 };
}

export async function verifyAuthentication(args: {
  userId: string;
  approvalId: string;
  response: AuthenticationResponseJSON;
  config: WebAuthnConfig;
  db: DrizzleClient;
}): Promise<{ ok: boolean }> {
  const expected = takeChallenge(challengeKey(args.userId, 'assert', args.approvalId));
  if (!expected) return { ok: false };
  const credentialId = args.response.id;
  const [stored] = await args.db
    .select()
    .from(schema.webauthnCredentials)
    .where(
      and(
        eq(schema.webauthnCredentials.userId, args.userId),
        eq(schema.webauthnCredentials.credentialId, credentialId),
      ),
    )
    .limit(1);
  if (!stored) return { ok: false };
  const publicKey = new Uint8Array(Buffer.from(stored.publicKey, 'base64url'));
  const verification = await verifyAuthenticationResponse({
    response: args.response,
    expectedChallenge: expected,
    expectedOrigin: args.config.origin,
    expectedRPID: args.config.rpId,
    requireUserVerification: false,
    credential: {
      id: stored.credentialId,
      publicKey,
      counter: stored.counter,
    },
  });
  if (!verification.verified) return { ok: false };
  await args.db
    .update(schema.webauthnCredentials)
    .set({
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: new Date(),
    })
    .where(eq(schema.webauthnCredentials.id, stored.id));
  return { ok: true };
}
