import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { Logger } from '../logger.js';
import { getRequestId } from './request-id.js';

export const loggerMiddleware = (baseLogger: Logger): MiddlewareHandler =>
  createMiddleware(async (c, next) => {
    const start = performance.now();
    const reqId = getRequestId(c);
    const log = baseLogger.child({ reqId, method: c.req.method, path: c.req.path });
    c.set('log', log);
    await next();
    const elapsedMs = Math.round(performance.now() - start);
    log.info({ status: c.res.status, elapsedMs }, 'request');
  });

export function getLog(c: import('hono').Context): Logger {
  const log = c.get('log');
  if (!log) throw new Error('logger not attached — ensure loggerMiddleware is registered');
  return log;
}
