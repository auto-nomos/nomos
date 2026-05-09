import { appendFile } from 'node:fs/promises';
import { didFromPublicKey } from '@credential-broker/crypto';
import { serve } from '@hono/node-server';
import { hexToBytes } from '@noble/hashes/utils';
import { createAuditEmitter, decisionToAudit } from './audit/emit.js';
import { createPostgresAuditEmitter } from './audit/postgres-emitter.js';
import { createPgAuditWriter } from './audit/postgres-writer.js';
import type { ReceiptEmitInput } from './routes/receipts.js';

async function appendReceipt(logPath: string, ev: ReceiptEmitInput): Promise<void> {
  await appendFile(logPath, `${JSON.stringify({ kind: 'receipt', ...ev })}\n`, 'utf8');
}

import pg from 'pg';
import { createPolicyCache } from './cache/policies.js';
import { createRevocationCache } from './cache/revocations.js';
import { loadConfig } from './config.js';
import { createControlPlaneClient } from './control-plane/client.js';
import { createLogger } from './logger.js';
import { initOtel } from './observability/otel.js';
import { initSentry } from './observability/sentry.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);

  // Initialize observability before anything else can throw.
  const otel = await initOtel(config, logger);
  const sentry = await initSentry(config, logger);

  const cpClient = createControlPlaneClient({
    baseUrl: config.CONTROL_PLANE_URL,
    serviceToken: config.CONTROL_PLANE_SERVICE_TOKEN,
    ...(config.CONTROL_PLANE_BUNDLE_VERIFY_KEY
      ? { bundleVerifyKey: config.CONTROL_PLANE_BUNDLE_VERIFY_KEY }
      : {}),
    logger,
    onSignatureFailure: (err) => sentry.captureException(err),
  });
  const trustedIssuerDid = config.CONTROL_PLANE_BUNDLE_VERIFY_KEY
    ? didFromPublicKey(hexToBytes(config.CONTROL_PLANE_BUNDLE_VERIFY_KEY))
    : undefined;
  if (trustedIssuerDid) {
    logger.info({ trustedIssuerDid }, 'pdp UCAN root issuer trust anchor configured');
  } else {
    if (config.NODE_ENV === 'production') {
      throw new Error(
        'CONTROL_PLANE_BUNDLE_VERIFY_KEY is required in production so the PDP can verify policy bundles and pin UCAN root issuers.',
      );
    }
    logger.warn(
      'CONTROL_PLANE_BUNDLE_VERIFY_KEY not set — UCAN root issuer is not pinned. Acceptable for local dev only.',
    );
  }

  // Customers the PDP services. In dev: comma-separated env list.
  // Sprint 8 push-revocation will let the control plane register customers
  // dynamically; for now an explicit allow-list keeps the cache scoped.
  const knownCustomers = (config.PDP_CUSTOMER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const policyCache = createPolicyCache({
    fetchBundle: cpClient.fetchBundle,
    refreshIntervalMs: config.POLICY_REFRESH_MS,
    logger,
    knownCustomers: () => knownCustomers,
  });
  const revocationCache = createRevocationCache({
    fetchRevocations: cpClient.fetchRevocations,
    refreshIntervalMs: config.REVOCATION_REFRESH_MS,
    logger,
    knownCustomers: () => knownCustomers,
  });

  policyCache.start();
  revocationCache.start();
  // Warm caches once on boot so /v1/authorize doesn't 404 for the first 60s.
  await Promise.allSettled(
    knownCustomers.flatMap((id) => [
      cpClient.fetchBundle(id).then((p) => (p ? policyCache.set(id, p) : undefined)),
      cpClient.fetchRevocations(id).then((r) => (r ? revocationCache.set(id, r) : undefined)),
    ]),
  );

  const auditPool =
    config.AUDIT_BACKEND === 'postgres'
      ? new pg.Pool({ connectionString: config.DATABASE_URL })
      : undefined;
  const pgEmitter = auditPool
    ? createPostgresAuditEmitter({
        writer: createPgAuditWriter(auditPool),
        flushIntervalMs: config.AUDIT_FLUSH_INTERVAL_MS,
        batchSizeMax: config.AUDIT_BATCH_SIZE_MAX,
        logger,
      })
    : undefined;
  if (pgEmitter) pgEmitter.start();
  const fileEmitter = pgEmitter
    ? undefined
    : createAuditEmitter({ logPath: config.AUDIT_LOG_PATH });
  const auditEmitter = pgEmitter ?? fileEmitter;
  if (!auditEmitter) {
    throw new Error('audit emitter could not be initialized');
  }

  const app = createServer({
    logger,
    policyCache,
    revocationCache,
    ...(trustedIssuerDid !== undefined ? { trustedIssuerDid } : {}),
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
    emitReceipt: async (ev) => {
      await appendReceipt(config.AUDIT_LOG_PATH, ev);
    },
    internal: { serviceToken: config.CONTROL_PLANE_SERVICE_TOKEN },
    oauthProxy: {
      fetchOAuthToken: cpClient.fetchOAuthToken,
      refreshOAuthToken: cpClient.refreshOAuthToken,
    },
    stepup: {
      create: async (args) => {
        const created = await cpClient.createStepUp(args);
        return { id: created.id, deepLink: created.deepLink };
      },
      getStepUp: cpClient.getStepUp,
    },
  });

  const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
    logger.info({ port: info.port }, 'pdp listening');
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    policyCache.stop();
    revocationCache.stop();
    server.close();
    if (pgEmitter) await pgEmitter.stop();
    if (auditPool) await auditPool.end();
    await otel.shutdown();
    await sentry.shutdown();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaught exception');
    sentry.captureException(err);
  });
}

void main().catch((err) => {
  console.error('fatal startup error', err);
  process.exit(1);
});
