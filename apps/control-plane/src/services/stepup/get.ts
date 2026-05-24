import { and, eq } from 'drizzle-orm';
import type { DrizzleClient } from '../../db/index.js';
import * as schema from '../../db/schema.js';

export interface StepUpStateRow {
  id: string;
  customerId: string;
  agentId: string;
  command: string;
  resource: unknown;
  state: 'pending' | 'approved' | 'denied' | 'expired';
  requestedAt: Date;
  expiresAt: Date;
  decidedAt: Date | null;
  decidedBy: string | null;
  cosignerAttestationJwt: string | null;
  cosignerUsedAt: Date | null;
}

export async function getStepUpApproval(
  db: DrizzleClient,
  id: string,
): Promise<StepUpStateRow | undefined> {
  const [row] = await db
    .select()
    .from(schema.pushApprovals)
    .where(eq(schema.pushApprovals.id, id))
    .limit(1);
  if (!row) return undefined;
  return {
    id: row.id,
    customerId: row.customerId,
    agentId: row.agentId,
    command: row.command,
    resource: row.resource,
    state: row.state,
    requestedAt: row.requestedAt,
    expiresAt: row.expiresAt,
    decidedAt: row.decidedAt ?? null,
    decidedBy: row.decidedBy ?? null,
    cosignerAttestationJwt: row.cosignerAttestationJwt ?? null,
    cosignerUsedAt: row.cosignerUsedAt ?? null,
  };
}

export async function getStepUpForCustomer(
  db: DrizzleClient,
  customerId: string,
  id: string,
): Promise<StepUpStateRow | undefined> {
  const [row] = await db
    .select()
    .from(schema.pushApprovals)
    .where(and(eq(schema.pushApprovals.id, id), eq(schema.pushApprovals.customerId, customerId)))
    .limit(1);
  if (!row) return undefined;
  return {
    id: row.id,
    customerId: row.customerId,
    agentId: row.agentId,
    command: row.command,
    resource: row.resource,
    state: row.state,
    requestedAt: row.requestedAt,
    expiresAt: row.expiresAt,
    decidedAt: row.decidedAt ?? null,
    decidedBy: row.decidedBy ?? null,
    cosignerAttestationJwt: row.cosignerAttestationJwt ?? null,
    cosignerUsedAt: row.cosignerUsedAt ?? null,
  };
}

/**
 * Sweeps any `pending` approvals whose `expiresAt` is in the past to
 * `expired`. Run lazily on read so a stale GET returns the right state
 * without needing a worker for Phase 1.
 */
export function isExpired(row: StepUpStateRow, now: Date): boolean {
  return row.state === 'pending' && row.expiresAt.getTime() <= now.getTime();
}
