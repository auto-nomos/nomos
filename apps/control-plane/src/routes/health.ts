import { Hono } from 'hono';
import { type Db, pingDb } from '../db/index.js';
import { getLog } from '../middleware/logger.js';

export interface HealthDeps {
  db: Db;
}

export function createHealthRoutes(deps: HealthDeps): Hono {
  const app = new Hono();

  app.get('/healthz', (c) => c.json({ ok: true, ts: Date.now() }));

  app.get('/readyz', async (c) => {
    try {
      await pingDb(deps.db);
      return c.json({ ok: true, ts: Date.now() });
    } catch (err) {
      const log = getLog(c);
      log.warn({ err }, 'readyz db ping failed');
      return c.json({ ok: false, error: 'db_unavailable' }, 503);
    }
  });

  return app;
}
