import { sealString, sha256Hex } from '@auto-nomos/crypto';
import { redact, totalFindings } from '@auto-nomos/redaction';
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
  promptCaptured: boolean;
}

export interface IngestSpanOptions {
  /**
   * P2 — platform-default AEAD key. When supplied AND the customer has
   * `prompt_capture_enabled = true` AND `accepted_tos_version` is set AND
   * the sample-rate hit fires AND the input carries `prompt`, the prompt
   * and (optional) reasoning are redacted, encrypted with the supplied
   * key, and inserted into `agent_span_prompts`.
   *
   * When undefined, any `input.prompt` is silently dropped — production
   * MUST supply this, but tests can omit to skip the path entirely.
   */
  promptCaptureKey?: Uint8Array;
}

/**
 * Stable 0..99 hash by span uuid so prompt + reasoning sample together
 * for the same row. djb2-xor over the uuid string; deterministic and
 * cheap. The first byte of sha256 would be equivalent — djb2 is just
 * faster and we don't need cryptographic uniformity for sampling.
 */
function sampleBucket(spanId: string): number {
  let h = 5381;
  for (let i = 0; i < spanId.length; i++) {
    h = ((h << 5) + h) ^ spanId.charCodeAt(i);
  }
  return (h >>> 0) % 100;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
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
  opts: IngestSpanOptions = {},
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
    return {
      spanId: existing.id,
      inserted: false,
      swarmId: existing.swarmId,
      promptCaptured: false,
    };
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

  const spanId = row!.id;
  let promptCaptured = false;
  // P2 — opt-in prompt + reasoning capture. Each guard fails closed: if
  // any of {key, config row, ToS, sample-rate, payload} is missing, the
  // prompt is silently dropped and the span insert still succeeds.
  if (opts.promptCaptureKey && input.prompt && input.prompt.text) {
    const cfg = await db.drizzle.query.customerObservabilityConfig.findFirst({
      where: eq(schema.customerObservabilityConfig.customerId, customerId),
    });
    const enabled =
      cfg?.promptCaptureEnabled === true &&
      cfg.acceptedTosVersion !== null &&
      cfg.acceptedTosVersion !== '' &&
      sampleBucket(spanId) < cfg.promptCaptureSampleRate;
    if (enabled) {
      const promptRed = redact(input.prompt.text);
      const reasoningRed = input.prompt.reasoning ? redact(input.prompt.reasoning) : null;
      // AAD binds (customer, span, aad-kind) so a DB-write attacker can't
      // swap ciphertexts between rows without triggering an auth failure
      // on decrypt. The decrypt path re-derives this same AAD.
      const aad = hexToBytes(sha256Hex(`${customerId}|${spanId}|span_v1`));
      const promptCt = sealString(opts.promptCaptureKey, promptRed.redacted, aad);
      const reasoningCt = reasoningRed
        ? sealString(opts.promptCaptureKey, reasoningRed.redacted, aad)
        : null;
      // Owner-only raw side. Same key + AAD so storage + cascade story
      // is identical; the only privilege difference is which RBAC
      // resource gates the read path.
      const rawPromptCt = sealString(opts.promptCaptureKey, input.prompt.text, aad);
      const rawReasoningCt = input.prompt.reasoning
        ? sealString(opts.promptCaptureKey, input.prompt.reasoning, aad)
        : null;
      const totalFindingsCount =
        totalFindings(promptRed.findings) +
        (reasoningRed ? totalFindings(reasoningRed.findings) : 0);
      const aggregated = reasoningRed
        ? {
            bearer_token: promptRed.findings.bearer_token + reasoningRed.findings.bearer_token,
            credit_card: promptRed.findings.credit_card + reasoningRed.findings.credit_card,
            ssn: promptRed.findings.ssn + reasoningRed.findings.ssn,
            email: promptRed.findings.email + reasoningRed.findings.email,
            phone: promptRed.findings.phone + reasoningRed.findings.phone,
          }
        : promptRed.findings;
      await db.drizzle.insert(schema.agentSpanPrompts).values({
        spanId,
        customerId,
        promptCiphertextHex: promptCt.ciphertextHex,
        promptNonceHex: promptCt.nonceHex,
        promptAadKind: 'span_v1',
        reasoningCiphertextHex: reasoningCt?.ciphertextHex ?? null,
        reasoningNonceHex: reasoningCt?.nonceHex ?? null,
        rawPromptCiphertextHex: rawPromptCt.ciphertextHex,
        rawPromptNonceHex: rawPromptCt.nonceHex,
        rawReasoningCiphertextHex: rawReasoningCt?.ciphertextHex ?? null,
        rawReasoningNonceHex: rawReasoningCt?.nonceHex ?? null,
        redactionFindings: totalFindingsCount > 0 ? aggregated : null,
        kmsKeyId: cfg.promptKmsKeyArn ?? 'platform-default',
        wrappedDekB64: null,
      });
      promptCaptured = true;
    }
  }

  return { spanId, inserted: true, swarmId: row!.swarmId, promptCaptured };
}
