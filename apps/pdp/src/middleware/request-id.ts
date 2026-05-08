import { randomBytes } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';

export const REQUEST_ID_HEADER = 'x-request-id';

export const requestId = (): MiddlewareHandler =>
  createMiddleware(async (c, next) => {
    const incoming = c.req.header(REQUEST_ID_HEADER);
    const id = incoming ?? randomBytes(8).toString('hex');
    c.set('requestId', id);
    c.header(REQUEST_ID_HEADER, id);
    await next();
  });

export function getRequestId(c: Context): string {
  return c.get('requestId') ?? 'unknown';
}
