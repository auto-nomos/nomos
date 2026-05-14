/**
 * cloud_connections data-access helpers.
 *
 * Keep DB shape isolated here so callers (internal routes, dashboard
 * tRPC router, verify-poll worker) share one source of truth.
 */

import type { CloudConnectionRef } from '@auto-nomos/core';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema.js';

export interface CloudConnectionRow extends CloudConnectionRef {
  displayName: string | null;
  bootstrapStatus: 'pending' | 'verified' | 'broken';
  lastVerifiedAt: Date | null;
  lastVerifyError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function rowToRef(row: typeof schema.cloudConnections.$inferSelect): CloudConnectionRow {
  return {
    id: row.id,
    customerId: row.customerId,
    connector: row.connector,
    accountId: row.accountId,
    tenantId: row.tenantId,
    externalId: row.externalId,
    config: (row.config ?? {}) as Record<string, unknown>,
    displayName: row.displayName,
    bootstrapStatus: row.bootstrapStatus,
    lastVerifiedAt: row.lastVerifiedAt,
    lastVerifyError: row.lastVerifyError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function loadCloudConnection(
  db: Db,
  customerId: string,
  connectionId: string,
): Promise<CloudConnectionRow | undefined> {
  const [row] = await db.drizzle
    .select()
    .from(schema.cloudConnections)
    .where(
      and(
        eq(schema.cloudConnections.id, connectionId),
        eq(schema.cloudConnections.customerId, customerId),
      ),
    )
    .limit(1);
  return row ? rowToRef(row) : undefined;
}

export async function listCloudConnections(
  db: Db,
  customerId: string,
): Promise<CloudConnectionRow[]> {
  const rows = await db.drizzle
    .select()
    .from(schema.cloudConnections)
    .where(eq(schema.cloudConnections.customerId, customerId));
  return rows.map(rowToRef);
}
