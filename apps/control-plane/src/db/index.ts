import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { Config } from '../config.js';
import * as schema from './schema.js';

export type Schema = typeof schema;
export type DrizzleClient = ReturnType<typeof drizzle<Schema>>;

export interface Db {
  pool: pg.Pool;
  drizzle: DrizzleClient;
}

export function createDb(config: Pick<Config, 'DATABASE_URL'>): Db {
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
  return { pool, drizzle: drizzle(pool, { schema }) };
}

export async function pingDb(db: Db): Promise<void> {
  const result = await db.pool.query<{ ok: number }>('SELECT 1 AS ok');
  if (result.rows[0]?.ok !== 1) {
    throw new Error('db ping returned unexpected result');
  }
}
