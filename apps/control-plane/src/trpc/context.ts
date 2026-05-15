import { expandRolePermissions, type Role } from '@auto-nomos/rbac';
import { and, eq } from 'drizzle-orm';
import type { Auth } from '../auth/index.js';
import type { CredsCache } from '../cloud/creds-cache.js';
import type { Config } from '../config.js';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema.js';
import type { Logger } from '../logger.js';
import { type InviteNotifier, loggerInviteNotifier } from '../services/invites/notify.js';
import type { TelegramBot } from '../services/notify/telegram-bot.js';
import { noopPolicyInvalidator, type PolicyInvalidator } from '../services/policy-invalidator.js';
import {
  noopRevocationPublisher,
  type RevocationPublisher,
} from '../services/revocation-publisher.js';
import type { WebAuthnConfig } from '../services/stepup/webauthn.js';
import type { CloudVerifyPoll } from '../workers/cloud-verify-poll.js';

export interface ContextDeps {
  db: Db;
  auth: Auth;
  logger: Logger;
  /** Control-plane signing key, used to sign minted UCANs (Sprint 5.4). */
  signing: { signKey: Uint8Array; signerDid: string };
  /** Sprint 8 — push revocation. Defaults to noop when unset (tests / dev). */
  revocationPublisher?: RevocationPublisher;
  /** P3 — push policy invalidation. Defaults to noop when unset. */
  policyInvalidator?: PolicyInvalidator;
  /** Sprint 9 — passkey origin/rpId. Required for stepup router. */
  webauthn?: WebAuthnConfig;
  /** OAuth refresh deps. Required for oauth.refresh / oauth.disconnect. */
  oauth?: { config: Config; encryptionKey: Uint8Array };
  /** Telegram bot for event notifications. Optional — omit in tests. */
  telegramBot?: TelegramBot;
  /** Session-creds cache; disconnect mutations invalidate by connectionId. */
  credsCache?: CredsCache;
  /** Verify-poll worker for `cloudConnections.verifyNow` mutation. */
  cloudVerifyPoll?: CloudVerifyPoll;
  /** Sends invite emails. Defaults to a logger-only fallback so dev/test
   *  flows work without a Knock key. */
  inviteNotifier?: InviteNotifier;
}

export interface Context {
  db: Db;
  logger: Logger;
  signing: { signKey: Uint8Array; signerDid: string };
  revocationPublisher: RevocationPublisher;
  policyInvalidator: PolicyInvalidator;
  webauthn: WebAuthnConfig | null;
  oauth: { config: Config; encryptionKey: Uint8Array } | null;
  telegramBot: TelegramBot | null;
  credsCache: CredsCache | null;
  cloudVerifyPoll: CloudVerifyPoll | null;
  inviteNotifier: InviteNotifier;
  session: {
    user: { id: string; email: string; name: string | null };
    token: string;
  } | null;
  /**
   * Active customer for the request. Resolved from the authenticated user's
   * first owner/admin membership. Multi-customer switching deferred to Sprint 6
   * (dashboard).
   */
  customerId: string | null;
  /**
   * Membership row backing `customerId`. `role` drives the permission gate
   * applied by `withPermission(resource, action)` in trpc/index.ts. Null when
   * the request has no session or the user lacks any membership.
   */
  membership: { customerId: string; role: Role } | null;
  /**
   * Pre-expanded permission bundle for `membership.role`. Mirrors the matrix
   * in @auto-nomos/rbac so callers can ask `permissions.agents?.includes('read')`
   * without re-importing the matrix on every check. Null when no membership.
   */
  permissions: ReturnType<typeof expandRolePermissions> | null;
}

/**
 * Build per-request tRPC context.
 *
 * Resolves the Better-Auth session from the request headers, then looks up
 * the user's first membership to determine the active customer scope.
 */
export async function createContext(req: Request, deps: ContextDeps): Promise<Context> {
  const session = await deps.auth.api.getSession({ headers: req.headers });

  let customerId: string | null = null;
  let membership: Context['membership'] = null;
  let permissions: Context['permissions'] = null;
  let userPayload: Context['session'] = null;

  if (session?.user) {
    userPayload = {
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name ?? null,
      },
      token: session.session.token,
    };

    // Resolution order for the active organization:
    //   1. x-cb-org cookie (fast hot-switch via dashboard)
    //   2. user.active_customer_id (server-persisted on invite-accept + switch)
    //   3. first owner-role membership
    //   4. first membership of any role
    // The cookie and the DB column are kept in sync by the switch mutation
    // and the invite accept mutation. The fallbacks exist for first-load on
    // a fresh device where neither has been populated yet.
    const requestedOrg = parseOrgCookie(req.headers.get('cookie') ?? '');
    let row: Awaited<ReturnType<typeof deps.db.drizzle.query.memberships.findFirst>> | undefined;
    if (requestedOrg) {
      row = await deps.db.drizzle.query.memberships.findFirst({
        where: and(
          eq(schema.memberships.userId, session.user.id),
          eq(schema.memberships.customerId, requestedOrg),
        ),
      });
    }
    if (!row) {
      const userRow = await deps.db.drizzle.query.user.findFirst({
        where: eq(schema.user.id, session.user.id),
        columns: { activeCustomerId: true },
      });
      if (userRow?.activeCustomerId) {
        row = await deps.db.drizzle.query.memberships.findFirst({
          where: and(
            eq(schema.memberships.userId, session.user.id),
            eq(schema.memberships.customerId, userRow.activeCustomerId),
          ),
        });
      }
    }
    if (!row) {
      const all = await deps.db.drizzle.query.memberships.findMany({
        where: eq(schema.memberships.userId, session.user.id),
      });
      row = all.find((m) => m.role === 'owner') ?? all[0];
    }
    if (row) {
      customerId = row.customerId;
      membership = { customerId: row.customerId, role: row.role as Role };
      permissions = expandRolePermissions(membership.role);
    }
  }

  return {
    db: deps.db,
    logger: deps.logger,
    signing: deps.signing,
    revocationPublisher: deps.revocationPublisher ?? noopRevocationPublisher(),
    policyInvalidator: deps.policyInvalidator ?? noopPolicyInvalidator(),
    webauthn: deps.webauthn ?? null,
    oauth: deps.oauth ?? null,
    telegramBot: deps.telegramBot ?? null,
    credsCache: deps.credsCache ?? null,
    cloudVerifyPoll: deps.cloudVerifyPoll ?? null,
    inviteNotifier: deps.inviteNotifier ?? loggerInviteNotifier(deps.logger),
    session: userPayload,
    customerId,
    membership,
    permissions,
  };
}

/**
 * Extract the active-org id from the request cookie header. Returns null
 * when the cookie is missing or malformed. UUID-shape check keeps callers
 * from passing junk that would just miss the membership lookup anyway.
 */
function parseOrgCookie(cookieHeader: string): string | null {
  if (cookieHeader === '') return null;
  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rest] = part.split('=');
    if (!rawName) continue;
    if (rawName.trim() !== 'x-cb-org') continue;
    const value = rest.join('=').trim();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      return value;
    }
    return null;
  }
  return null;
}
