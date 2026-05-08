import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { PolicyCache } from './cache/policies.js';
import type { RevocationCache } from './cache/revocations.js';
import type { Logger } from './logger.js';
import { loggerMiddleware } from './middleware/logger.js';
import { requestId } from './middleware/request-id.js';
import { type AuditEmitInput, createAuthorizeRoutes } from './routes/authorize.js';
import { healthRoutes } from './routes/health.js';

export interface ServerDeps {
  logger: Logger;
  policyCache: PolicyCache;
  revocationCache: RevocationCache;
  emitAudit?: (event: AuditEmitInput) => Promise<void> | void;
}

export function createServer(deps: ServerDeps): Hono {
  const app = new Hono();

  app.use('*', secureHeaders());
  app.use('*', requestId());
  app.use('*', loggerMiddleware(deps.logger));

  app.route('/', healthRoutes);
  app.route(
    '/',
    createAuthorizeRoutes({
      policyCache: deps.policyCache,
      revocationCache: deps.revocationCache,
      ...(deps.emitAudit !== undefined ? { emitAudit: deps.emitAudit } : {}),
    }),
  );

  app.onError((err, c) => {
    deps.logger.error({ err }, 'unhandled error');
    return c.json({ error: 'internal_error' }, 500);
  });

  app.notFound((c) => c.json({ error: 'not_found' }, 404));

  return app;
}
