import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';

/**
 * Bearer-token guard for service-to-service `/v1/internal/*` endpoints.
 * Token comes from CONTROL_PLANE_SERVICE_TOKEN; control-plane carries the
 * same value when pushing revocations (Sprint 8).
 */
export const internalAuth = (token: string): MiddlewareHandler =>
  createMiddleware(async (c, next) => {
    const auth = c.req.header('authorization') ?? '';
    const got = auth.replace(/^Bearer\s+/i, '');
    if (got !== token || got === '') {
      return c.json({ error: 'unauthorized' }, 401);
    }
    await next();
  });
