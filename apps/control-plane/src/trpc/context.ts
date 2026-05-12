import { eq } from 'drizzle-orm';
import type { Auth } from '../auth/index.js';
import type { Config } from '../config.js';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema.js';
import type { Logger } from '../logger.js';
import type { TelegramBot } from '../services/notify/telegram-bot.js';
import {
  noopRevocationPublisher,
  type RevocationPublisher,
} from '../services/revocation-publisher.js';
import type { WebAuthnConfig } from '../services/stepup/webauthn.js';

export interface ContextDeps {
  db: Db;
  auth: Auth;
  logger: Logger;
  /** Control-plane signing key, used to sign minted UCANs (Sprint 5.4). */
  signing: { signKey: Uint8Array; signerDid: string };
  /** Sprint 8 — push revocation. Defaults to noop when unset (tests / dev). */
  revocationPublisher?: RevocationPublisher;
  /** Sprint 9 — passkey origin/rpId. Required for stepup router. */
  webauthn?: WebAuthnConfig;
  /** OAuth refresh deps. Required for oauth.refresh / oauth.disconnect. */
  oauth?: { config: Config; encryptionKey: Uint8Array };
  /** Telegram bot for event notifications. Optional — omit in tests. */
  telegramBot?: TelegramBot;
}

export interface Context {
  db: Db;
  logger: Logger;
  signing: { signKey: Uint8Array; signerDid: string };
  revocationPublisher: RevocationPublisher;
  webauthn: WebAuthnConfig | null;
  oauth: { config: Config; encryptionKey: Uint8Array } | null;
  telegramBot: TelegramBot | null;
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
    webauthn: deps.webauthn ?? null,
    oauth: deps.oauth ?? null,
    telegramBot: deps.telegramBot ?? null,
    session: userPayload,
    customerId,
  };
}
