import { pino } from 'pino';
import type { Config } from './config.js';

export type Logger = ReturnType<typeof pino>;

export function createLogger(config: Pick<Config, 'LOG_LEVEL' | 'NODE_ENV'>): Logger {
  return pino({
    level: config.LOG_LEVEL,
    base: { service: 'control-plane' },
    ...(config.NODE_ENV === 'development'
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, ignore: 'pid,hostname' },
          },
        }
      : {}),
  });
}
