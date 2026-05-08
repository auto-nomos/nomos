import { serve } from '@hono/node-server';
import { createPolicyCache } from './cache/policies.js';
import { createRevocationCache } from './cache/revocations.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);

  const policyCache = createPolicyCache({
    fetchBundle: async () => undefined,
    refreshIntervalMs: config.POLICY_REFRESH_MS,
    logger,
  });
  const revocationCache = createRevocationCache({
    fetchRevocations: async () => undefined,
    refreshIntervalMs: config.REVOCATION_REFRESH_MS,
    logger,
  });

  policyCache.start();
  revocationCache.start();

  const app = createServer({ logger, policyCache, revocationCache });

  serve({ fetch: app.fetch, port: config.PORT }, (info) => {
    logger.info({ port: info.port }, 'pdp listening');
  });
}

void main().catch((err) => {
  console.error('fatal startup error', err);
  process.exit(1);
});
