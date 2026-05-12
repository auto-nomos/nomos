/**
 * Periodic OAuth refresh sweep — D-1 (Sprint 5.6).
 *
 * Every `intervalMs` milliseconds, scan oauth_connections for tokens that
 * are about to expire (default: any access_token_expires_at within 24h or
 * any refresh_token_expires_at within 24h) and call `refreshConnection` on
 * each. Failures are logged and skipped — the next iteration retries; a
 * persistent failure is surfaced when an agent eventually proxies through
 * the dead connection.
 *
 * The sweep runs as a setInterval inside the control-plane process. v2 of
 * the plan explicitly defers Upstash Queue (or any external job runner)
 * until customer demand justifies it; this is fine while the platform
 * fits in one Fly machine.
 */
import { and, gte, isNotNull, lt, lte, or } from 'drizzle-orm';
import type { Config } from '../config.js';
import type { DrizzleClient } from '../db/index.js';
import * as schema from '../db/schema.js';
import type { Logger } from '../logger.js';
import type { TelegramBot } from './notify/telegram-bot.js';
import { type RefreshDeps, RefreshError, refreshConnection } from './oauth-refresh.js';

export interface OAuthSweepDeps {
  db: DrizzleClient;
  encryptionKey: Uint8Array;
  config: Config;
  logger: Logger;
  fetch?: typeof fetch;
  /**
   * Connections whose access token expires within this many ms are
   * considered candidates for proactive refresh. Default 24h.
   */
  refreshLookaheadMs?: number;
  /**
   * How often to sweep. Default 1 hour. Tests can pass shorter.
   */
  intervalMs?: number;
  /** Override clock for tests. */
  now?: () => number;
  /** Telegram bot — when set, sends a message to the customer on refresh failure. */
  telegramBot?: TelegramBot;
}

export interface OAuthSweepHandle {
  start: () => void;
  stop: () => void;
  /** Run a single sweep iteration synchronously — primarily for tests. */
  runOnce: () => Promise<{ scanned: number; refreshed: number; failed: number }>;
}

const DEFAULT_LOOKAHEAD_MS = 24 * 60 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

export function createOAuthSweep(deps: OAuthSweepDeps): OAuthSweepHandle {
  const lookahead = deps.refreshLookaheadMs ?? DEFAULT_LOOKAHEAD_MS;
  const interval = deps.intervalMs ?? DEFAULT_INTERVAL_MS;
  let timer: NodeJS.Timeout | undefined;
  let inFlight = false;

  const refreshDeps: RefreshDeps = {
    db: deps.db,
    encryptionKey: deps.encryptionKey,
    config: deps.config,
    ...(deps.fetch !== undefined ? { fetch: deps.fetch } : {}),
  };

  async function runOnce() {
    if (inFlight) {
      deps.logger.debug('oauth-sweep skipped — previous iteration still running');
      return { scanned: 0, refreshed: 0, failed: 0 };
    }
    inFlight = true;
    try {
      const nowMs = deps.now ? deps.now() : Date.now();
      const cutoff = new Date(nowMs + lookahead);
      const earliest = new Date(nowMs - 5 * 60 * 1000);
      // Candidate = any connection whose access OR refresh token expires before
      // cutoff. (And that hasn't already expired more than 5 minutes ago — if
      // it's that stale we'll surface it via on-demand refresh next time the
      // PDP touches the connection rather than burning sweep cycles on it.)
      const candidates = await deps.db
        .select({
          id: schema.oauthConnections.id,
          customerId: schema.oauthConnections.customerId,
          connector: schema.oauthConnections.connector,
          accessTokenExpiresAt: schema.oauthConnections.accessTokenExpiresAt,
          refreshTokenExpiresAt: schema.oauthConnections.refreshTokenExpiresAt,
        })
        .from(schema.oauthConnections)
        .where(
          or(
            and(
              isNotNull(schema.oauthConnections.accessTokenExpiresAt),
              lt(schema.oauthConnections.accessTokenExpiresAt, cutoff),
              gte(schema.oauthConnections.accessTokenExpiresAt, earliest),
            ),
            and(
              isNotNull(schema.oauthConnections.refreshTokenExpiresAt),
              lt(schema.oauthConnections.refreshTokenExpiresAt, cutoff),
              gte(schema.oauthConnections.refreshTokenExpiresAt, earliest),
            ),
          ),
        );

      let refreshed = 0;
      let failed = 0;
      for (const c of candidates) {
        try {
          await refreshConnection(refreshDeps, c.customerId, c.id);
          refreshed += 1;
        } catch (err) {
          failed += 1;
          if (err instanceof RefreshError) {
            deps.logger.warn(
              { connectionId: c.id, connector: c.connector, code: err.code },
              'sweep: refresh failed',
            );
            void deps.telegramBot
              ?.sendToCustomer(
                c.customerId,
                `⚠️ *OAuth refresh failed*: \`${c.connector}\` connection needs re-authentication.\nError: \`${err.code}\`\nVisit the dashboard to reconnect.`,
              )
              .catch(() => {});
          } else {
            deps.logger.error(
              { err, connectionId: c.id, connector: c.connector },
              'sweep: refresh threw unexpected error',
            );
          }
        }
      }

      if (candidates.length > 0) {
        deps.logger.info(
          { scanned: candidates.length, refreshed, failed },
          'oauth-sweep iteration complete',
        );
      }
      return { scanned: candidates.length, refreshed, failed };
    } finally {
      inFlight = false;
    }
  }

  function tick(): void {
    runOnce().catch((err) => {
      deps.logger.error({ err }, 'oauth-sweep tick threw');
    });
  }

  return {
    start() {
      if (timer) return;
      timer = setInterval(tick, interval);
      // Don't keep the process alive solely for the sweep timer.
      timer.unref?.();
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    },
    runOnce,
  };
}

// Drizzle helpers reference: `lte` is imported but `lt` covers the cutoff;
// `lte` kept available for future tuning without re-importing.
export const __sweepDrizzleHelpers = { gte, lt, lte, isNotNull, or, and };
