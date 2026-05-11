/**
 * Envelope store — persistence layer for the Approval Envelope model.
 *
 * An envelope is a passkey-cosigned grant that bounds the resource scope
 * + action set + lifetime within which the broker may silently mint
 * dynamic UCANs for an agent. The /v1/intent route looks up active
 * envelopes covering an incoming intent; the dashboard lists + revokes.
 */
import type { ResourceConstraint } from '@auto-nomos/shared-types';
import { ResourceConstraint as ResourceConstraintSchema } from '@auto-nomos/shared-types';
import { constraintCovers } from '@auto-nomos/ucan';
import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type { DrizzleClient } from '../db/index.js';
import * as schema from '../db/schema.js';

export interface Envelope {
  id: string;
  customerId: string;
  agentId: string;
  constraint: ResourceConstraint;
  actions: string[];
  parentUcanCid: string | null;
  createdBy: string | null;
  createdAt: Date;
  /** Null for standing envelopes (durable until revoked). */
  expiresAt: Date | null;
  revokedAt: Date | null;
  isStanding: boolean;
}

function rowToEnvelope(row: typeof schema.envelopes.$inferSelect): Envelope {
  return {
    id: row.id,
    customerId: row.customerId,
    agentId: row.agentId,
    constraint: ResourceConstraintSchema.parse(row.constraint),
    actions: row.actions,
    parentUcanCid: row.parentUcanCid,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    isStanding: row.isStanding,
  };
}

export interface CreateEnvelopeInput {
  customerId: string;
  agentId: string;
  constraint: ResourceConstraint;
  actions: string[];
  parentUcanCid?: string;
  createdBy?: string;
  ttlSeconds: number;
}

export async function createEnvelope(
  db: DrizzleClient,
  input: CreateEnvelopeInput,
  now: () => number = Date.now,
): Promise<Envelope> {
  const expiresAt = new Date(now() + input.ttlSeconds * 1000);
  const [row] = await db
    .insert(schema.envelopes)
    .values({
      customerId: input.customerId,
      agentId: input.agentId,
      constraint: input.constraint,
      actions: input.actions,
      parentUcanCid: input.parentUcanCid ?? null,
      createdBy: input.createdBy ?? null,
      expiresAt,
      isStanding: false,
    })
    .returning();
  if (!row) throw new Error('envelope insert returned no row');
  return rowToEnvelope(row);
}

export interface CreateStandingEnvelopeInput {
  customerId: string;
  agentId: string;
  constraint: ResourceConstraint;
  actions: string[];
  parentUcanCid?: string;
  createdBy?: string;
}

/**
 * Standing envelopes are durable: no `expiresAt`, only revocation kills
 * them. Always require step-up + cosigner — callers must enforce that
 * upstream. The dashboard surfaces these prominently with a revoke CTA.
 */
export async function createStandingEnvelope(
  db: DrizzleClient,
  input: CreateStandingEnvelopeInput,
): Promise<Envelope> {
  const [row] = await db
    .insert(schema.envelopes)
    .values({
      customerId: input.customerId,
      agentId: input.agentId,
      constraint: input.constraint,
      actions: input.actions,
      parentUcanCid: input.parentUcanCid ?? null,
      createdBy: input.createdBy ?? null,
      expiresAt: null,
      isStanding: true,
    })
    .returning();
  if (!row) throw new Error('standing envelope insert returned no row');
  return rowToEnvelope(row);
}

export async function listActiveEnvelopes(
  db: DrizzleClient,
  customerId: string,
  agentId: string,
  now: () => number = Date.now,
): Promise<Envelope[]> {
  const cutoff = new Date(now());
  const rows = await db
    .select()
    .from(schema.envelopes)
    .where(
      and(
        eq(schema.envelopes.customerId, customerId),
        eq(schema.envelopes.agentId, agentId),
        isNull(schema.envelopes.revokedAt),
        // Active = standing (no expiry) OR expiresAt > now.
        or(isNull(schema.envelopes.expiresAt), gt(schema.envelopes.expiresAt, cutoff)),
      ),
    )
    .orderBy(desc(schema.envelopes.createdAt));
  return rows.map(rowToEnvelope);
}

export async function listAllForCustomer(
  db: DrizzleClient,
  customerId: string,
): Promise<Envelope[]> {
  const rows = await db
    .select()
    .from(schema.envelopes)
    .where(eq(schema.envelopes.customerId, customerId))
    .orderBy(desc(schema.envelopes.createdAt));
  return rows.map(rowToEnvelope);
}

/**
 * Find one active envelope that fully covers the requested constraint
 * + actions. Returns the most-recently-created match. The caller should
 * mint the child UCAN as a delegation from this envelope.
 */
export function findCoveringEnvelope(
  envelopes: Envelope[],
  constraint: ResourceConstraint,
  actions: string[],
): Envelope | undefined {
  const actionSet = new Set(actions);
  return envelopes.find(
    (e) =>
      constraintCovers(e.constraint, constraint) &&
      [...actionSet].every((a) => e.actions.includes(a)),
  );
}

export async function revokeEnvelope(
  db: DrizzleClient,
  customerId: string,
  envelopeId: string,
  revokedBy: string | null,
  now: () => number = Date.now,
): Promise<Envelope | undefined> {
  const [row] = await db
    .update(schema.envelopes)
    .set({ revokedAt: new Date(now()) })
    .where(
      and(
        eq(schema.envelopes.id, envelopeId),
        eq(schema.envelopes.customerId, customerId),
        isNull(schema.envelopes.revokedAt),
      ),
    )
    .returning();
  // revokedBy is recorded via the existing revocations table (Sprint 8)
  // when the envelope's child UCANs are revoked downstream; envelope row
  // itself only carries revokedAt. Caller wires revocation push.
  void revokedBy;
  return row ? rowToEnvelope(row) : undefined;
}

/**
 * Sweep expired envelopes — used by the existing oauth-sweep cadence
 * (or a dedicated envelope sweep worker). Returns the count purged.
 * Standing envelopes (null expiresAt) are never swept here.
 */
export async function purgeExpired(
  db: DrizzleClient,
  now: () => number = Date.now,
): Promise<number> {
  const res = await db
    .delete(schema.envelopes)
    .where(
      and(
        sql`${schema.envelopes.expiresAt} IS NOT NULL`,
        sql`${schema.envelopes.expiresAt} <= ${new Date(now())}`,
        isNull(schema.envelopes.revokedAt),
      ),
    );
  return res.rowCount ?? 0;
}
