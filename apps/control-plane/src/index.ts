import { generateKeypair, keypairFromPrivate } from '@credential-broker/crypto';
import { serve } from '@hono/node-server';
import { hexToBytes } from '@noble/hashes/utils';
import { createAuth } from './auth/index.js';
import { type Config, loadConfig } from './config.js';
import { createDb } from './db/index.js';
import { createLogger, type Logger } from './logger.js';
import { createServer } from './server.js';

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
  const app = createServer({
    logger,
    db,
    auth,
    internal: {
      signKey,
      signerDid,
      serviceToken: config.CONTROL_PLANE_SERVICE_TOKEN,
    },
  });

  const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
    logger.info({ port: info.port }, 'control-plane listening');
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
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
