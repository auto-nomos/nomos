import { eq } from 'drizzle-orm';
import type { Auth } from '../auth/index.js';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema.js';
import type { Logger } from '../logger.js';
import {
  noopRevocationPublisher,
  type RevocationPublisher,
} from '../services/revocation-publisher.js';

export interface ContextDeps {
  db: Db;
  auth: Auth;
  logger: Logger;
  /** Control-plane signing key, used to sign minted UCANs (Sprint 5.4). */
  signing: { signKey: Uint8Array; signerDid: string };
  /** Sprint 8 — push revocation. Defaults to noop when unset (tests / dev). */
  revocationPublisher?: RevocationPublisher;
}

export interface Context {
  db: Db;
  logger: Logger;
  signing: { signKey: Uint8Array; signerDid: string };
  revocationPublisher: RevocationPublisher;
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

    const membership = await deps.db.drizzle.query.memberships.findFirst({
      where: eq(schema.memberships.userId, session.user.id),
    });
    customerId = membership?.customerId ?? null;
  }

  return {
    db: deps.db,
    logger: deps.logger,
    signing: deps.signing,
    revocationPublisher: deps.revocationPublisher ?? noopRevocationPublisher(),
    session: userPayload,
    customerId,
  };
}
