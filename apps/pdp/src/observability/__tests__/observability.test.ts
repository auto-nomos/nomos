import pino from 'pino';
import { describe, expect, it } from 'vitest';
import type { Config } from '../../config.js';
import { initOtel } from '../otel.js';
import { initSentry } from '../sentry.js';

const logger = pino({ level: 'silent' });

const baseConfig: Config = {
  PORT: 8787,
  LOG_LEVEL: 'info',
  CONTROL_PLANE_URL: 'http://localhost:8788',
  CONTROL_PLANE_SERVICE_TOKEN: 'tok',
  POLICY_REFRESH_MS: 60_000,
  REVOCATION_REFRESH_MS: 5_000,
  AUDIT_LOG_PATH: './audit.log',
  NODE_ENV: 'test',
  OTEL_SERVICE_NAME: 'cb-pdp-test',
  SENTRY_TRACES_SAMPLE_RATE: 0.1,
};

describe('initOtel', () => {
  it('returns a no-op handle when OTEL endpoint is not configured', async () => {
    const handle = await initOtel(baseConfig, logger);
    await expect(handle.shutdown()).resolves.toBeUndefined();
  });
});

describe('initSentry', () => {
  it('returns a no-op handle when SENTRY_DSN is not configured', async () => {
    const handle = await initSentry(baseConfig, logger);
    await expect(handle.shutdown()).resolves.toBeUndefined();
    expect(() => handle.captureException(new Error('test'))).not.toThrow();
  });
});
