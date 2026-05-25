import type { EmitSpanInput } from '@auto-nomos/shared-types';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema.js';

export class SpanIngestError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'receipt_not_found'
      | 'receipt_wrong_tenant'
      | 'agent_mismatch'
      | 'invalid_parent_span',
  ) {
    super(message);
    this.name = 'SpanIngestError';
  }
}

interface IngestSpanArgs {
  customerId: string;
  agentId: string;
  input: EmitSpanInput;
}

interface IngestSpanResult {
  spanId: string;
  inserted: boolean;
  swarmId: string | null;
}

/**
 * Insert one span row. Idempotent on `(customer_id, receipt_id)`.
 *
 * Invariants enforced here, not at the route boundary:
 * - The referenced `audit_events.event_id` must belong to the same customer
 *   AND the same agent that authenticated. This blocks an agent from
 *   ghost-writing spans against another tenant's receipts (or another agent
 *   in their own tenant).
 * - `parent_span_id`, if supplied, must also be same-tenant. Cross-tenant
 *   parent chains corrupt the graph and the multi-head causality story.
 *
 * Returns `{ inserted: false }` when a row already exists — fire-and-forget
 * retries on the MCP side don't double-write.
 */
export async function ingestSpan(
  { customerId, agentId, input }: IngestSpanArgs,
  db: Db,
): Promise<IngestSpanResult> {
  // decision.receiptId is sha256 hex (not the row's event_id uuid). Look up
  // by the dedicated text column added in migration 0026.
  const receipt = await db.drizzle.query.auditEvents.findFirst({
    where: and(
      eq(schema.auditEvents.receiptId, input.receiptId),
      eq(schema.auditEvents.customerId, customerId),
    ),
    columns: { eventId: true, agent: true, swarmId: true, customerId: true },
  });

  if (!receipt) {
    const wrongTenant = await db.drizzle.query.auditEvents.findFirst({
      where: eq(schema.auditEvents.receiptId, input.receiptId),
      columns: { customerId: true },
    });
    if (wrongTenant) {
      throw new SpanIngestError('receipt belongs to a different customer', 'receipt_wrong_tenant');
    }
    throw new SpanIngestError('receipt not found', 'receipt_not_found');
  }

  const agentRow = await db.drizzle.query.agents.findFirst({
    where: and(eq(schema.agents.id, agentId), eq(schema.agents.customerId, customerId)),
    columns: { id: true, did: true },
  });
  if (!agentRow || receipt.agent !== agentRow.did) {
    throw new SpanIngestError(
      'receipt agent DID does not match authenticated agent',
      'agent_mismatch',
    );
  }

  if (input.parentSpanId) {
    const parent = await db.drizzle.query.agentSpans.findFirst({
      where: and(
        eq(schema.agentSpans.id, input.parentSpanId),
        eq(schema.agentSpans.customerId, customerId),
      ),
      columns: { id: true },
    });
    if (!parent) {
      throw new SpanIngestError('parent span not in this tenant', 'invalid_parent_span');
    }
  }

  const existing = await db.drizzle.query.agentSpans.findFirst({
    where: and(
      eq(schema.agentSpans.customerId, customerId),
      eq(schema.agentSpans.receiptId, input.receiptId),
    ),
    columns: { id: true, swarmId: true },
  });
  if (existing) {
    return { spanId: existing.id, inserted: false, swarmId: existing.swarmId };
  }

  const [row] = await db.drizzle
    .insert(schema.agentSpans)
    .values({
      customerId,
      swarmId: receipt.swarmId ?? null,
      agentId,
      receiptId: input.receiptId,
      parentSpanId: input.parentSpanId ?? null,
      toolName: input.toolName,
      status: input.status,
      httpStatus: input.httpStatus ?? null,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      requestArgsHash: input.requestArgsHash,
      requestSummary: input.requestSummary ?? null,
      responseHash: input.responseHash ?? null,
      responseSummary: input.responseSummary ?? null,
      nextAgentHint: input.nextAgentHint ?? null,
      intent: input.intent ?? null,
      // P1 — flatten the typed handoff envelope into the four hot columns.
      // Validation lives in zod (SpanHandoffSchema); ingest is a passthrough.
      handoffToDid: input.handoff?.toAgentDid ?? null,
      handoffTask: input.handoff?.task ?? null,
      handoffExpectedOutput: input.handoff?.expectedOutput ?? null,
      handoffRationale: input.handoff?.rationale ?? null,
      startedAt: new Date(input.startedAt),
      endedAt: new Date(input.endedAt),
      latencyMs: input.latencyMs,
    })
    .returning({ id: schema.agentSpans.id, swarmId: schema.agentSpans.swarmId });

  return { spanId: row!.id, inserted: true, swarmId: row!.swarmId };
}
