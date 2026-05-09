import { serve } from '@hono/node-server';
import { createAuth } from './auth/index.js';
import { loadConfig } from './config.js';
import { createDb } from './db/index.js';
import { createLogger } from './logger.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);

  const db = createDb(config);
  const auth = createAuth({ db: db.drizzle, config, logger });
  const app = createServer({ logger, db, auth });

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
