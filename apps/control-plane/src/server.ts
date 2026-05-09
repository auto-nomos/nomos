import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { Auth } from './auth/index.js';
import type { Db } from './db/index.js';
import type { Logger } from './logger.js';
import { loggerMiddleware } from './middleware/logger.js';
import { requestId } from './middleware/request-id.js';
import { createHealthRoutes } from './routes/health.js';

export interface ServerDeps {
  logger: Logger;
  db: Db;
  auth: Auth;
}

export function createServer(deps: ServerDeps): Hono {
  const app = new Hono();

  app.use('*', secureHeaders());
  app.use('*', requestId());
  app.use('*', loggerMiddleware(deps.logger));

  app.route('/', createHealthRoutes({ db: deps.db }));

  // Better-Auth handles all /auth/* routes itself (sign-up, sign-in, sign-out,
  // get-session, etc.). It expects the raw Request and returns a Response.
  app.all('/auth/*', (c) => deps.auth.handler(c.req.raw));

  app.onError((err, c) => {
    deps.logger.error({ err }, 'unhandled error');
    return c.json({ error: 'internal_error' }, 500);
  });

  app.notFound((c) => c.json({ error: 'not_found' }, 404));

  return app;
}
