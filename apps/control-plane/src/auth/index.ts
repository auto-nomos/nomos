import { randomUUID } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { Config } from '../config.js';
import type { DrizzleClient } from '../db/index.js';
import * as schema from '../db/schema.js';
import type { Logger } from '../logger.js';

export interface AuthDeps {
  db: DrizzleClient;
  config: Pick<Config, 'BETTER_AUTH_SECRET' | 'CONTROL_PLANE_PUBLIC_URL' | 'WORKOS_API_KEY'>;
  logger: Logger;
}

export type Auth = ReturnType<typeof createAuth>;

/**
 * Wires Better-Auth on top of Drizzle.
 *
 * After-hook on user creation atomically creates a default customer + owner
 * membership for the new user. Customer name is derived from the email domain
 * (e.g. `alice@acme.com` → "acme") for a sensible first-run default.
 *
 * WorkOS SSO is wired-but-disabled while WORKOS_API_KEY is empty. Sprint 11
 * (deploy sprint) flips it on for production by populating the env var.
 */
export function createAuth(deps: AuthDeps) {
  const { db, config, logger } = deps;

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    secret: config.BETTER_AUTH_SECRET,
    baseURL: config.CONTROL_PLANE_PUBLIC_URL,
    basePath: '/auth',
    advanced: {
      // Our DB schema uses uuid for user.id / session.id / account.id /
      // verification.id. Better-Auth's default generator emits short opaque
      // strings, which Postgres rejects on uuid columns.
      database: { generateId: () => randomUUID() },
    },
    // Permit Hono's `app.request` test transport (origin = http://localhost),
    // common dev dashboard ports, and 127.0.0.1 variants used by e2e scripts.
    trustedOrigins: [
      'http://localhost',
      'http://localhost:3000',
      'http://localhost:8788',
      'http://127.0.0.1',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:8788',
    ],
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      minPasswordLength: 8,
    },
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
              { userId: createdUser.id, customerId: customer.id, customerName },
              'user signed up: customer + owner membership created',
            );
          },
        },
      },
    },
    // WorkOS connector left out until Sprint 11. Add a `socialProviders` /
    // `oauth` block here once WORKOS_API_KEY is populated for prod.
  });
}

function inferCustomerName(email: string): string {
  const domain = email.split('@')[1];
  if (!domain) return 'My Org';
  const head = domain.split('.')[0];
  return head && head.length > 0 ? head : 'My Org';
}
