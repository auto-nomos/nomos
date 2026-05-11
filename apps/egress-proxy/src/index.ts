import pino from 'pino';
import { z } from 'zod';
import { createStdoutSink } from './audit-shim.js';
import { createEgressProxy } from './proxy.js';

const ConfigSchema = z.object({
  EGRESS_PROXY_PORT: z.coerce.number().int().positive().default(25290),
  EGRESS_PROXY_HOST: z.string().default('127.0.0.1'),
  LOG_LEVEL: z.string().default('info'),
});

async function main(): Promise<void> {
  const config = ConfigSchema.parse(process.env);
  const logger = pino({
    level: config.LOG_LEVEL,
    transport: { target: 'pino-pretty', options: { colorize: true } },
  });

  const proxy = createEgressProxy({
    port: config.EGRESS_PROXY_PORT,
    host: config.EGRESS_PROXY_HOST,
    audit: createStdoutSink(),
    logger: {
      info: (...args) => logger.info(args),
      warn: (...args) => logger.warn(args),
    },
  });

  await proxy.start();
  logger.info(
    {
      mode: 'observe-only',
      port: config.EGRESS_PROXY_PORT,
      hint: `export HTTPS_PROXY=http://${config.EGRESS_PROXY_HOST}:${config.EGRESS_PROXY_PORT}`,
    },
    'egress proxy ready',
  );

  const shutdown = async (): Promise<void> => {
    logger.info('egress proxy stopping');
    await proxy.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
