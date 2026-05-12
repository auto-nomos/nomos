import { and, eq, isNull } from 'drizzle-orm';
import type { DrizzleClient } from '../../db/index.js';
import * as schema from '../../db/schema.js';
import { buildCedarPreview } from './llm-risk-summary.js';

export interface UpsertGrantInput {
  customerId: string;
  agentId: string;
  agentName: string;
  command: string;
  resource: Record<string, unknown>;
  scope: 'exact' | 'any';
  decision: 'allow' | 'deny';
  grantedBy: string;
  sourceApprovalId?: string;
  riskSummary?: string | null;
  /**
   * When set, this exact Cedar text is persisted as the grant's snippet
   * instead of the deterministic preview. The dashboard's 3-variant
   * picker uses this to record the variant the operator selected.
   */
  cedarSnippet?: string;
}

export interface UpsertedGrant {
  id: string;
  decision: 'allow' | 'deny';
}

/**
 * Upsert an active grant for (customer, agent, command). At most one active
 * grant is allowed per tuple — a fresh decision supersedes the prior row
 * (the old row is marked revoked and a new row is inserted). Inserting a
 * new row rather than updating preserves the audit trail of every change.
 */
export async function upsertGrant(
  db: DrizzleClient,
  input: UpsertGrantInput,
): Promise<UpsertedGrant> {
  const cedarSnippet = input.cedarSnippet ?? buildCedarPreviewForGrant(input);
  return await db.transaction(async (tx) => {
    const active = await tx
      .select({ id: schema.agentGrants.id })
      .from(schema.agentGrants)
      .where(
        and(
          eq(schema.agentGrants.customerId, input.customerId),
          eq(schema.agentGrants.agentId, input.agentId),
          eq(schema.agentGrants.command, input.command),
          isNull(schema.agentGrants.revokedAt),
        ),
      );
    if (active.length > 0) {
      await tx
        .update(schema.agentGrants)
        .set({ revokedAt: new Date(), revokedBy: input.grantedBy })
        .where(
          and(
            eq(schema.agentGrants.customerId, input.customerId),
            eq(schema.agentGrants.agentId, input.agentId),
            eq(schema.agentGrants.command, input.command),
            isNull(schema.agentGrants.revokedAt),
          ),
        );
    }
    const [row] = await tx
      .insert(schema.agentGrants)
      .values({
        customerId: input.customerId,
        agentId: input.agentId,
        command: input.command,
        resourcePattern: input.scope === 'exact' ? input.resource : {},
        scope: input.scope,
        decision: input.decision,
        cedarSnippet,
        riskSummary: input.riskSummary ?? null,
        sourceApprovalId: input.sourceApprovalId ?? null,
        grantedBy: input.grantedBy,
      })
      .returning({ id: schema.agentGrants.id, decision: schema.agentGrants.decision });
    if (!row) throw new Error('agent_grants insert returned no rows');
    return { id: row.id, decision: row.decision as 'allow' | 'deny' };
  });
}

function buildCedarPreviewForGrant(input: UpsertGrantInput): string {
  return buildCedarPreview({
    agentName: input.agentName,
    command: input.command,
    resource: input.scope === 'exact' ? input.resource : {},
  });
}

export async function revokeGrant(
  db: DrizzleClient,
  customerId: string,
  grantId: string,
  revokedBy: string,
): Promise<boolean> {
  const result = await db
    .update(schema.agentGrants)
    .set({ revokedAt: new Date(), revokedBy })
    .where(
      and(
        eq(schema.agentGrants.id, grantId),
        eq(schema.agentGrants.customerId, customerId),
        isNull(schema.agentGrants.revokedAt),
      ),
    )
    .returning({ id: schema.agentGrants.id });
  return result.length > 0;
}
