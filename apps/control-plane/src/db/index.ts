import pg from 'pg';
import type { Config } from '../config.js';

export type Db = pg.Pool;

export function createDb(config: Pick<Config, 'DATABASE_URL'>): Db {
  return new pg.Pool({ connectionString: config.DATABASE_URL });
}

export async function pingDb(db: Db): Promise<void> {
  const result = await db.query<{ ok: number }>('SELECT 1 AS ok');
  if (result.rows[0]?.ok !== 1) {
    throw new Error('db ping returned unexpected result');
  }
}
