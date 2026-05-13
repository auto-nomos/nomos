/**
 * Passkey plugin for Better-Auth (hand-rolled).
 *
 * Better-Auth 1.6.9 doesn't ship an official passkey plugin, so this file
 * supplies one using `@simplewebauthn/server` for the WebAuthn primitives
 * and Better-Auth's public plugin surface (`createAuthEndpoint`,
 * `sessionMiddleware`, `setSessionCookie`, `internalAdapter`) for session
 * minting and cookie handling. Endpoints mount under the auth base path
 * (e.g. `/auth/passkey/...`).
 *
 * Endpoints:
 *  - POST /passkey/register/options   (session required) → CreationOptions
 *  - POST /passkey/register/verify    (session required) → { credentialId }
 *  - POST /passkey/authenticate/options (public)         → RequestOptions
 *  - POST /passkey/authenticate/verify  (public)         → mints session cookie
 *  - POST /passkey/list               (session required)
 *  - POST /passkey/delete             (session required)
 *
 * Challenge persistence uses Better-Auth's `verification` table so the flow
 * survives multi-instance deploys. Identifier scheme:
 *   `pk-reg:<userId>` for registration challenges
 *   `pk-auth:<challenge>` for authentication challenges (challenge is a
 *     random 32-byte string, suitable as a unique key)
 */
import {
  type AuthenticationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { createAuthEndpoint, sessionMiddleware } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { and, eq } from 'drizzle-orm';
import * as z from 'zod';
import type { DrizzleClient } from '../db/index.js';
import * as schema from '../db/schema.js';

export interface PasskeyPluginOptions {
  rpID: string;
  rpName: string;
  origin: string;
  db: DrizzleClient;
  /** Challenge lifetime; defaults to 5 minutes. */
  challengeTtlMs?: number;
}

const REG_TTL_DEFAULT = 5 * 60 * 1_000;

function regIdentifier(userId: string): string {
  return `pk-reg:${userId}`;
}
function authIdentifier(challenge: string): string {
  return `pk-auth:${challenge}`;
}

export function passkeyPlugin(opts: PasskeyPluginOptions) {
  const ttl = opts.challengeTtlMs ?? REG_TTL_DEFAULT;

  return {
    id: 'passkey',
    endpoints: {
      passkeyRegisterOptions: createAuthEndpoint(
        '/passkey/register/options',
        { method: 'POST', use: [sessionMiddleware] },
        async (ctx) => {
          const userId = ctx.context.session.user.id;
          const userEmail = ctx.context.session.user.email;
          const existing = await opts.db
            .select({ credentialID: schema.passkey.credentialID })
            .from(schema.passkey)
            .where(eq(schema.passkey.userId, userId));
          const options = await generateRegistrationOptions({
            rpName: opts.rpName,
            rpID: opts.rpID,
            userID: Uint8Array.from(new TextEncoder().encode(userId)),
            userName: userEmail,
            attestationType: 'none',
            authenticatorSelection: {
              residentKey: 'preferred',
              userVerification: 'required',
            },
            excludeCredentials: existing.map((c) => ({ id: c.credentialID })),
          });
          // upsert: drop any prior registration challenge for this user
          await ctx.context.internalAdapter
            .deleteVerificationByIdentifier(regIdentifier(userId))
            .catch(() => undefined);
          await ctx.context.internalAdapter.createVerificationValue({
            identifier: regIdentifier(userId),
            value: options.challenge,
            expiresAt: new Date(Date.now() + ttl),
          });
          return ctx.json(options);
        },
      ),
      passkeyRegisterVerify: createAuthEndpoint(
        '/passkey/register/verify',
        {
          method: 'POST',
          use: [sessionMiddleware],
          body: z.object({
            response: z.any(),
            name: z.string().min(1).max(120).optional(),
          }),
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id;
          const response = ctx.body.response as RegistrationResponseJSON;
          const stored = await ctx.context.internalAdapter.findVerificationValue(
            regIdentifier(userId),
          );
          if (!stored || stored.expiresAt < new Date()) {
            return ctx.json(
              { verified: false, error: 'expired_or_missing_challenge' },
              { status: 400 },
            );
          }
          const verification = await verifyRegistrationResponse({
            response,
            expectedChallenge: stored.value,
            expectedOrigin: opts.origin,
            expectedRPID: opts.rpID,
            requireUserVerification: true,
          });
          await ctx.context.internalAdapter.deleteVerificationByIdentifier(regIdentifier(userId));
          if (!verification.verified || !verification.registrationInfo) {
            return ctx.json({ verified: false, error: 'verification_failed' }, { status: 400 });
          }
          const info = verification.registrationInfo;
          const credentialID = info.credential.id;
          const publicKey = Buffer.from(info.credential.publicKey).toString('base64url');
          const transports = response.response.transports?.join(',') ?? null;
          await opts.db.insert(schema.passkey).values({
            userId,
            credentialID,
            publicKey,
            counter: info.credential.counter,
            deviceType: info.credentialDeviceType,
            backedUp: info.credentialBackedUp,
            transports: transports,
            aaguid: info.aaguid ?? null,
            name: ctx.body.name ?? null,
          });
          // mark user as enrolled (idempotent — keep the first timestamp)
          await opts.db
            .update(schema.user)
            .set({ passkeyEnrolledAt: new Date() })
            .where(eq(schema.user.id, userId));
          return ctx.json({ verified: true, credentialId: credentialID });
        },
      ),
      passkeyAuthenticateOptions: createAuthEndpoint(
        '/passkey/authenticate/options',
        { method: 'POST', body: z.object({ email: z.string().email().optional() }).optional() },
        async (ctx) => {
          // Usernameless by default: empty allowCredentials → browser picks
          // a discoverable credential. When email is supplied (recover or
          // explicit-account flow), limit to that user's creds.
          let allow: { id: string }[] = [];
          const email = ctx.body?.email;
          if (email) {
            const u = await opts.db
              .select({ id: schema.user.id })
              .from(schema.user)
              .where(eq(schema.user.email, email))
              .limit(1);
            if (u[0]) {
              const creds = await opts.db
                .select({ credentialID: schema.passkey.credentialID })
                .from(schema.passkey)
                .where(eq(schema.passkey.userId, u[0].id));
              allow = creds.map((c) => ({ id: c.credentialID }));
            }
          }
          const options = await generateAuthenticationOptions({
            rpID: opts.rpID,
            allowCredentials: allow,
            userVerification: 'required',
          });
          await ctx.context.internalAdapter.createVerificationValue({
            identifier: authIdentifier(options.challenge),
            value: '1',
            expiresAt: new Date(Date.now() + ttl),
          });
          return ctx.json(options);
        },
      ),
      passkeyAuthenticateVerify: createAuthEndpoint(
        '/passkey/authenticate/verify',
        {
          method: 'POST',
          body: z.object({ response: z.any() }),
        },
        async (ctx) => {
          const response = ctx.body.response as AuthenticationResponseJSON;
          const credentialID = response.id;
          const [stored] = await opts.db
            .select()
            .from(schema.passkey)
            .where(eq(schema.passkey.credentialID, credentialID))
            .limit(1);
          if (!stored) {
            return ctx.json({ verified: false, error: 'unknown_credential' }, { status: 401 });
          }
          // pull challenge — the client-supplied response carries it in
          // clientDataJSON, but we trust only the one we stashed server-side.
          const clientData = JSON.parse(
            Buffer.from(response.response.clientDataJSON, 'base64url').toString('utf8'),
          ) as { challenge: string };
          const challenge = clientData.challenge;
          const challengeRow = await ctx.context.internalAdapter.findVerificationValue(
            authIdentifier(challenge),
          );
          if (!challengeRow || challengeRow.expiresAt < new Date()) {
            return ctx.json(
              { verified: false, error: 'expired_or_missing_challenge' },
              { status: 401 },
            );
          }
          await ctx.context.internalAdapter.deleteVerificationByIdentifier(
            authIdentifier(challenge),
          );
          const publicKey = new Uint8Array(Buffer.from(stored.publicKey, 'base64url'));
          const verification = await verifyAuthenticationResponse({
            response,
            expectedChallenge: challenge,
            expectedOrigin: opts.origin,
            expectedRPID: opts.rpID,
            requireUserVerification: true,
            credential: { id: stored.credentialID, publicKey, counter: stored.counter },
          });
          if (!verification.verified) {
            return ctx.json({ verified: false, error: 'verification_failed' }, { status: 401 });
          }
          await opts.db
            .update(schema.passkey)
            .set({ counter: verification.authenticationInfo.newCounter })
            .where(eq(schema.passkey.id, stored.id));
          // Mint a Better-Auth session for the credential's owner.
          const user = await ctx.context.internalAdapter.findUserById(stored.userId);
          if (!user) {
            return ctx.json({ verified: false, error: 'user_not_found' }, { status: 401 });
          }
          const session = await ctx.context.internalAdapter.createSession(user.id);
          if (!session) {
            return ctx.json({ verified: false, error: 'session_create_failed' }, { status: 500 });
          }
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ verified: true, userId: user.id, token: session.token });
        },
      ),
      passkeyList: createAuthEndpoint(
        '/passkey/list',
        { method: 'POST', use: [sessionMiddleware] },
        async (ctx) => {
          const userId = ctx.context.session.user.id;
          const rows = await opts.db
            .select({
              id: schema.passkey.id,
              name: schema.passkey.name,
              credentialID: schema.passkey.credentialID,
              deviceType: schema.passkey.deviceType,
              backedUp: schema.passkey.backedUp,
              transports: schema.passkey.transports,
              createdAt: schema.passkey.createdAt,
            })
            .from(schema.passkey)
            .where(eq(schema.passkey.userId, userId));
          return ctx.json(rows);
        },
      ),
      passkeyDelete: createAuthEndpoint(
        '/passkey/delete',
        {
          method: 'POST',
          use: [sessionMiddleware],
          body: z.object({ id: z.string().uuid() }),
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id;
          const result = await opts.db
            .delete(schema.passkey)
            .where(and(eq(schema.passkey.id, ctx.body.id), eq(schema.passkey.userId, userId)))
            .returning({ id: schema.passkey.id });
          return ctx.json({ deleted: result.length > 0 });
        },
      ),
    },
  } as const;
}
