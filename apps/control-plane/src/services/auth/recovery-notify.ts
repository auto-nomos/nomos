import type { Logger } from '../../logger.js';

export interface RecoveryNotifyArgs {
  email: string;
  code: string;
  ttlMinutes: number;
}

export interface RecoveryNotifierOptions {
  /** KNOCK_API_KEY. Empty/undefined = dev console fallback. */
  apiKey?: string | undefined;
  /** Knock workflow id. Defaults to `auth-recovery-otp`. */
  workflow?: string;
  logger: Logger;
  fetch?: typeof fetch;
}

export type RecoveryNotifier = (args: RecoveryNotifyArgs) => Promise<void>;

const KNOCK_BASE = 'https://api.knock.app/v1';

export function createRecoveryNotifier(opts: RecoveryNotifierOptions): RecoveryNotifier {
  const fetchFn = opts.fetch ?? globalThis.fetch;
  const workflow = opts.workflow ?? 'auth-recovery-otp';

  return async (args: RecoveryNotifyArgs) => {
    if (!opts.apiKey || opts.apiKey.length === 0) {
      opts.logger.info(
        { devFallback: true, email: args.email, code: args.code, ttlMinutes: args.ttlMinutes },
        'AUTH RECOVERY DEV CONSOLE — paste this code into /recover',
      );
      return;
    }
    const body = JSON.stringify({
      recipients: [{ id: args.email, email: args.email }],
      data: {
        code: args.code,
        ttl_minutes: args.ttlMinutes,
      },
    });
    try {
      const res = await fetchFn(`${KNOCK_BASE}/workflows/${workflow}/trigger`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${opts.apiKey}`,
        },
        body,
      });
      if (!res.ok) {
        opts.logger.warn(
          { status: res.status, email: args.email },
          'knock recovery OTP send failed',
        );
      }
    } catch (err) {
      opts.logger.warn({ err, email: args.email }, 'knock recovery OTP errored');
    }
  };
}
