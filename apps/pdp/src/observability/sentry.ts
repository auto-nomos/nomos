import type { Config } from '../config.js';
import type { Logger } from '../logger.js';

export interface SentryHandle {
  shutdown(): Promise<void>;
  captureException(err: unknown): void;
}

const NOOP: SentryHandle = {
  shutdown: async () => {},
  captureException: () => {},
};

/**
 * Initialize Sentry when SENTRY_DSN is set; returns a no-op handle otherwise.
 */
export async function initSentry(config: Config, logger: Logger): Promise<SentryHandle> {
  if (!config.SENTRY_DSN) {
    logger.info('SENTRY_DSN not set; skipping Sentry init');
    return NOOP;
  }
  const Sentry = await import('@sentry/node');
  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.NODE_ENV,
    tracesSampleRate: config.SENTRY_TRACES_SAMPLE_RATE,
  });
  logger.info('Sentry initialized');
  return {
    async shutdown() {
      await Sentry.close(2000);
    },
    captureException(err: unknown) {
      Sentry.captureException(err);
    },
  };
}
