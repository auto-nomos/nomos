import { generateKeypair, keypairFromPrivate, loadSecretboxKey } from '@credential-broker/crypto';
import { serve } from '@hono/node-server';
import { hexToBytes } from '@noble/hashes/utils';
import { createAuth } from './auth/index.js';
import { type Config, loadConfig } from './config.js';
import { createDb } from './db/index.js';
import { createLogger, type Logger } from './logger.js';
import { createServer } from './server.js';
import { createOAuthSweep } from './services/oauth-sweep.js';
import { createRevocationPublisher } from './services/revocation-publisher.js';
import { createAuditRootSigner } from './workers/audit-root-signer.js';

function loadOAuthEncryptionKey(config: Config, logger: Logger): Uint8Array {
  const isDevPlaceholder = config.OAUTH_TOKEN_ENCRYPTION_KEY === '00'.repeat(32);
  if (isDevPlaceholder) {
    if (config.NODE_ENV === 'production') {
      throw new Error(
        'OAUTH_TOKEN_ENCRYPTION_KEY must be set in production. Run `pnpm gen-keys` to generate one.',
      );
    }
    logger.warn(
      'OAUTH_TOKEN_ENCRYPTION_KEY is the dev placeholder — generate a real one with `pnpm gen-keys` before storing real tokens',
    );
  }
  return loadSecretboxKey(config.OAUTH_TOKEN_ENCRYPTION_KEY);
}

function loadAuditSigningKey(
  config: Config,
  logger: Logger,
): { signKey: Uint8Array; signingKeyId: string } | undefined {
  if (!config.AUDIT_SIGN_KEY || config.AUDIT_SIGN_KEY.length === 0) {
    if (config.NODE_ENV === 'production') {
      throw new Error(
        'AUDIT_SIGN_KEY is required in production. Run `pnpm gen-keys` once and set the value.',
      );
    }
    logger.warn('AUDIT_SIGN_KEY not set — daily audit roots disabled in dev. Run `pnpm gen-keys`.');
    return undefined;
  }
  const kp = keypairFromPrivate(hexToBytes(config.AUDIT_SIGN_KEY));
  const signingKeyId = config.AUDIT_SIGNING_KEY_ID ?? kp.did;
  logger.info({ signingKeyId }, 'loaded audit root signing key from env');
  return { signKey: kp.privateKey, signingKeyId };
}

function loadSigningKey(
  config: Config,
  logger: Logger,
): { signKey: Uint8Array; signerDid: string } {
  if (config.CONTROL_PLANE_BUNDLE_SIGN_KEY && config.CONTROL_PLANE_BUNDLE_SIGN_KEY.length > 0) {
    const kp = keypairFromPrivate(hexToBytes(config.CONTROL_PLANE_BUNDLE_SIGN_KEY));
    logger.info({ did: kp.did }, 'loaded bundle signing key from env');
    return { signKey: kp.privateKey, signerDid: kp.did };
  }
  if (config.NODE_ENV === 'production') {
    throw new Error(
      'CONTROL_PLANE_BUNDLE_SIGN_KEY is required in production. Run `pnpm gen-keys` once and set the value.',
    );
  }
  const kp = generateKeypair();
  logger.warn(
    { did: kp.did },
    'CONTROL_PLANE_BUNDLE_SIGN_KEY not set — generated ephemeral signing key for dev. PDP will reject signatures across restarts.',
  );
  return { signKey: kp.privateKey, signerDid: kp.did };
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);

  const db = createDb(config);
  const auth = createAuth({ db: db.drizzle, config, logger });
  const { signKey, signerDid } = loadSigningKey(config, logger);
  const encryptionKey = loadOAuthEncryptionKey(config, logger);

  const pdpWebhookUrls = (config.PDP_WEBHOOK_URLS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (pdpWebhookUrls.length === 0) {
    logger.warn(
      'PDP_WEBHOOK_URLS not set — push revocation disabled; PDPs will discover revokes via 5s polling sweep only',
    );
  } else {
    logger.info({ count: pdpWebhookUrls.length }, 'push revocation enabled');
  }
  const revocationPublisher = createRevocationPublisher({
    webhookUrls: pdpWebhookUrls,
    serviceToken: config.CONTROL_PLANE_SERVICE_TOKEN,
    logger,
  });

  const app = createServer({
    logger,
    db,
    auth,
    signing: { signKey, signerDid },
    internal: { serviceToken: config.CONTROL_PLANE_SERVICE_TOKEN },
    oauth: { config, encryptionKey },
    revocationPublisher,
  });

  const sweep = createOAuthSweep({
    db: db.drizzle,
    encryptionKey,
    config,
    logger,
  });
  sweep.start();
  logger.info('oauth refresh sweep started (interval=1h, lookahead=24h)');

  const auditSigning = loadAuditSigningKey(config, logger);
  const auditRootSigner = auditSigning
    ? createAuditRootSigner({
        db: db.drizzle,
        signKey: auditSigning.signKey,
        signingKeyId: auditSigning.signingKeyId,
        logger,
        intervalMs: config.AUDIT_ROOT_SIGN_INTERVAL_MS,
      })
    : undefined;
  if (auditRootSigner) {
    auditRootSigner.start();
    logger.info({ intervalMs: config.AUDIT_ROOT_SIGN_INTERVAL_MS }, 'audit root signer started');
  }

  const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
    logger.info({ port: info.port }, 'control-plane listening');
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    sweep.stop();
    auditRootSigner?.stop();
    server.close();
    await db.pool.end();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaught exception');
  });
}

void main().catch((err) => {
  console.error('fatal startup error', err);
  process.exit(1);
});
