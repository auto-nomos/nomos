import { z } from 'zod';

/**
 * Observability v2 — per-tool-call execution telemetry.
 *
 * Distinct from authorize receipts (`audit_events`): a span records what
 * actually happened *after* PDP said allow — the upstream call's outcome,
 * latency, hashes of the payload, plus a tiny allowlisted summary. Privacy
 * default is hashes + summary; never raw bodies.
 */

export const SpanStatusSchema = z.enum(['success', 'failure', 'timeout', 'denied']);
export type SpanStatus = z.infer<typeof SpanStatusSchema>;

export const SpanSummarySchema = z.record(z.string(), z.unknown()).optional();
export type SpanSummary = z.infer<typeof SpanSummarySchema>;

export const EmitSpanInputSchema = z.object({
  receiptId: z.string().min(1),
  toolName: z.string().min(1).max(256),
  status: SpanStatusSchema,
  startedAt: z.string().datetime({ offset: true }),
  endedAt: z.string().datetime({ offset: true }),
  latencyMs: z.number().int().min(0),
  httpStatus: z.number().int().min(0).max(999).optional().nullable(),
  errorCode: z.string().max(128).optional().nullable(),
  errorMessage: z.string().max(1024).optional().nullable(),
  requestArgsHash: z.string().length(64),
  requestSummary: SpanSummarySchema.nullable(),
  responseHash: z.string().length(64).optional().nullable(),
  responseSummary: SpanSummarySchema.nullable(),
  parentSpanId: z.string().uuid().optional().nullable(),
  nextAgentHint: z.string().max(256).optional().nullable(),
  intent: z.string().max(256).optional().nullable(),
});
export type EmitSpanInput = z.infer<typeof EmitSpanInputSchema>;

export interface Span {
  id: string;
  customerId: string;
  swarmId: string | null;
  agentId: string;
  receiptId: string;
  parentSpanId: string | null;
  toolName: string;
  status: SpanStatus;
  httpStatus: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  requestArgsHash: string;
  requestSummary: Record<string, unknown> | null;
  responseHash: string | null;
  responseSummary: Record<string, unknown> | null;
  nextAgentHint: string | null;
  intent: string | null;
  startedAt: string;
  endedAt: string;
  latencyMs: number;
  createdAt: string;
}

/**
 * Action graph — forward-flowing conversation tree.
 *
 * Each node is a span (tool call). Spans link to an effective parent so the
 * tree branches when an agent spawns a sub-agent. Agent identity travels on
 * the span (color + label + DID); a sidecar `agents` map drives the legend.
 *
 * Conversation = connected component rooted at a span with no parent in the
 * window. `rootSpanId` is set on every span for cheap grouping in the UI.
 */
export interface AgentGraphNode {
  id: string;
  label: string;
  did: string;
  depth: number | null;
  spanCount: number;
  color: string;
}

export interface SpanGraphNode {
  kind: 'span';
  id: string;
  agentId: string;
  agentDid: string;
  agentLabel: string;
  agentColor: string;
  effectiveParentId: string | null;
  rootSpanId: string;
  toolName: string;
  status: SpanStatus;
  latencyMs: number;
  httpStatus: number | null;
  startedAt: string;
}

export type ActionGraphNode = SpanGraphNode;

export type ActionGraphEdgeKind = 'parent' | 'sequential' | 'spawn';

export interface ActionGraphEdge {
  id: string;
  from: string;
  to: string;
  kind: ActionGraphEdgeKind;
}

export interface ActionGraph {
  nodes: ActionGraphNode[];
  edges: ActionGraphEdge[];
  agents: Record<string, AgentGraphNode>;
  windowMinutes: number;
  spanCount: number;
}
