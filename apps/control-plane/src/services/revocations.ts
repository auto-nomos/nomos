import { eq } from 'drizzle-orm';
import type { DrizzleClient } from '../db/index.js';
import * as schema from '../db/schema.js';

export async function fetchRevokedCids(customerId: string, db: DrizzleClient): Promise<string[]> {
  const rows = await db
    .select({ cid: schema.revocations.cid })
    .from(schema.revocations)
    .where(eq(schema.revocations.customerId, customerId));
  return rows.map((r) => r.cid);
}
