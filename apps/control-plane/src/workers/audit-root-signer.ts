import type { DrizzleClient } from '../db/index.js';
import type { Logger } from '../logger.js';
import { signRootsForAllCustomers } from '../services/audit-roots.js';

export interface AuditRootSignerOptions {
  db: DrizzleClient;
  signKey: Uint8Array;
  signingKeyId: string;
  logger: Logger;
  /** Default 24h. */
  intervalMs?: number;
  /** Optional clock injection for tests. */
  now?: () => Date;
}

export interface AuditRootSigner {
  start(): void;
  stop(): void;
  /** Run a single pass synchronously (used by tests + manual triggers). */
  runOnce(): Promise<{ customers: number; signed: number }>;
}

/**
 * Sprint 8.3 — runs `signRootsForAllCustomers` on a fixed interval. Single
 * setInterval inside the control-plane process for now (Phase 1 lean stack);
 * Sprint 11+ may move this to Upstash Queue or a dedicated cron worker.
 */
export function createAuditRootSigner(opts: AuditRootSignerOptions): AuditRootSigner {
  const intervalMs = opts.intervalMs ?? 24 * 60 * 60 * 1_000;
  let timer: NodeJS.Timeout | undefined;

  async function runOnce(): Promise<{ customers: number; signed: number }> {
    try {
      const result = await signRootsForAllCustomers({
        db: opts.db,
        signKey: opts.signKey,
        signingKeyId: opts.signingKeyId,
        ...(opts.now ? { now: opts.now } : {}),
      });
      opts.logger.info(result, 'audit roots signed');
      return result;
    } catch (err) {
      opts.logger.error({ err }, 'audit root signing failed');
      return { customers: 0, signed: 0 };
    }
  }

  return {
    runOnce,
    start() {
      if (timer) return;
      timer = setInterval(() => {
        void runOnce();
      }, intervalMs);
      if (typeof timer.unref === 'function') timer.unref();
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    },
  };
}
