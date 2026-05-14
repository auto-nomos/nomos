import { randomUUID } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP } from 'better-auth/plugins/email-otp';
import type { Config } from '../config.js';
import type { DrizzleClient } from '../db/index.js';
import * as schema from '../db/schema.js';
import type { Logger } from '../logger.js';
import { passkeyPlugin } from './passkey-plugin.js';

export type AuthRecoveryNotifier = (args: {
  email: string;
  code: string;
  ttlMinutes: number;
}) => Promise<void>;

export interface AuthDeps {
  db: DrizzleClient;
  config: Pick<
    Config,
    | 'BETTER_AUTH_SECRET'
    | 'CONTROL_PLANE_PUBLIC_URL'
    | 'DASHBOARD_PUBLIC_URL'
    | 'NODE_ENV'
    | 'WORKOS_API_KEY'
  >;
  logger: Logger;
  /** Sends the 6-digit recovery code via Knock. Falls back to console log
   *  when no notifier is wired (dev). */
  recoveryNotifier?: AuthRecoveryNotifier;
}

export type Auth = ReturnType<typeof betterAuth>;

/**
 * Wires Better-Auth on top of Drizzle.
 *
 * - Passkey plugin is the primary auth path. New accounts and sign-in both
 *   flow through WebAuthn. Step-up assertion reads the same `passkey` table.
 * - Email-OTP plugin powers /recover: a one-time 6-digit code emailed via
 *   Knock lets a user sign in and re-enroll a passkey after device loss.
 * - Email + password stays enabled with `autoSignIn: false` for the grace
 *   period only. Middleware bounces such sessions to /onboarding/enroll-passkey
 *   until they have a passkey on file; password is dropped after the grace
 *   window ends (next release after 0019_passkey_unification ships).
 *
 * After-hook on user creation atomically creates a default customer + owner
 * membership for the new user. Customer name is derived from the email
 * domain (e.g. `alice@acme.com` → "acme") for a sensible first-run default.
 *
 * WorkOS SSO is wired-but-disabled while WORKOS_API_KEY is empty.
 */
export function createAuth(deps: AuthDeps): Auth {
  const { db, config, logger } = deps;
  const dashboardUrl = new URL(config.DASHBOARD_PUBLIC_URL);
  const isProd = config.NODE_ENV === 'production';

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        passkey: schema.passkey,
      },
    }),
    secret: config.BETTER_AUTH_SECRET,
    baseURL: config.CONTROL_PLANE_PUBLIC_URL,
    basePath: '/auth',
    advanced: {
      // Our DB schema uses uuid for user.id / session.id / account.id /
      // verification.id / passkey.id. Better-Auth's default generator emits
      // short opaque strings which Postgres rejects on uuid columns.
      database: { generateId: () => randomUUID() },
      cookies: {
        sessionToken: {
          attributes: {
            httpOnly: true,
            sameSite: 'lax',
            secure: isProd,
          },
        },
      },
    },
    rateLimit: {
      enabled: config.NODE_ENV !== 'test',
      window: 60,
      max: 10,
    },
    session: {
      // 7-day rolling session, refreshed on use after 24h.
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    trustedOrigins: [
      'http://localhost',
      'http://localhost:3000',
      'http://localhost:8788',
      'http://127.0.0.1',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:8788',
      'https://app.auto-nomos.com',
      'https://auto-nomos.com',
      'https://www.auto-nomos.com',
    ],
    emailAndPassword: {
      // Grace-period only. Kept on so existing users can sign in once and
      // be routed to enroll a passkey. Flip to `enabled: false` (and drop
      // the password column) once the grace window ends.
      //
      // Sign-up generates a random password client-side (the UI never asks
      // the user for one); autoSignIn is preserved so the resulting session
      // can immediately enroll a passkey via `authClient.passkey.addPasskey`.
      enabled: true,
      autoSignIn: true,
      minPasswordLength: 12,
    },
    plugins: [
      passkeyPlugin({
        rpID: dashboardUrl.hostname,
        rpName: 'Nomos',
        origin: dashboardUrl.origin,
        db,
      }),
      emailOTP({
        otpLength: 6,
        expiresIn: 10 * 60,
        sendVerificationOTP: async ({ email, otp, type }) => {
          if (deps.recoveryNotifier) {
            await deps.recoveryNotifier({ email, code: otp, ttlMinutes: 10 });
            return;
          }
          logger.info(
            { devFallback: true, email, otp, type },
            'AUTH RECOVERY DEV CONSOLE — enter this code in /recover',
          );
        },
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          after: async (createdUser) => {
            const customerName = inferCustomerName(createdUser.email);
            const customer = (
              await db.insert(schema.customers).values({ name: customerName }).returning()
            )[0];
            if (!customer) {
              throw new Error('failed to create default customer during sign-up');
            }
            await db.insert(schema.memberships).values({
              userId: createdUser.id,
              customerId: customer.id,
              role: 'owner',
            });
            logger.info(
              {
                event: 'auth.signup.success',
                userId: createdUser.id,
                customerId: customer.id,
                customerName,
              },
              'user signed up: customer + owner membership created',
            );
          },
        },
      },
      session: {
        create: {
          after: async (createdSession) => {
            // Auth-lifecycle audit trail. The hash-chained `audit_events`
            // table is reserved for PDP decision receipts; auth events go
            // through structured pino logs (shipped to Sentry / ops) so
            // they don't conflate the two trails.
            logger.info(
              {
                event: 'auth.signin.success',
                userId: createdSession.userId,
                sessionId: createdSession.id,
                ipAddress: createdSession.ipAddress ?? null,
                userAgent: createdSession.userAgent ?? null,
              },
              'session created',
            );
          },
        },
      },
    },
  }) as unknown as Auth;
}

function inferCustomerName(email: string): string {
  const domain = email.split('@')[1];
  if (!domain) return 'My Org';
  const head = domain.split('.')[0];
  return head && head.length > 0 ? head : 'My Org';
}
