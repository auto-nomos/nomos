import { serve } from '@hono/node-server';
import { createAuditEmitter, decisionToAudit } from './audit/emit.js';
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

  const auditEmitter = createAuditEmitter({ logPath: config.AUDIT_LOG_PATH });

  const app = createServer({
    logger,
    policyCache,
    revocationCache,
    emitAudit: async (ev) => {
      await auditEmitter.emit({
        customer_id: ev.customerId,
        ts: ev.ts,
        agent: ev.agentDid,
        decision: decisionToAudit(ev.decision),
        command: ev.request.command,
        resource: ev.request.resource,
        context: ev.request.context as Record<string, unknown>,
      });
    },
  });

  serve({ fetch: app.fetch, port: config.PORT }, (info) => {
    logger.info({ port: info.port }, 'pdp listening');
  });
}

void main().catch((err) => {
  console.error('fatal startup error', err);
  process.exit(1);
});
