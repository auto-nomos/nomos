/**
 * Pure span-tree derivation for the observability action graph.
 *
 * Turns the flat `agent_spans` rows (joined with `audit_events.parent_receipt_id`)
 * into a forward-flowing conversation tree:
 *
 *   - Effective parent for each span comes from the first of:
 *       1. explicit `parentSpanId` if the parent is in-window
 *       2. `parentReceiptId` resolved to a prior span in-window
 *       3. most-recent prior span by the same agent (sequential fallback)
 *       4. null → conversation root
 *   - Edge kind reflects the relationship:
 *       - `spawn`      — parent.agentId !== child.agentId (cross-agent fork)
 *       - `parent`     — explicit link, same agent
 *       - `sequential` — implicit chronological link, same agent
 *   - `rootSpanId` is propagated by walking the parent chain once.
 *   - Agent identity (label, DID, color) travels on the span; the sidecar
 *     `agents` map powers the legend in the UI.
 */
import type {
  ActionGraphEdge,
  AgentGraphNode,
  SpanGraphNode,
  SpanStatus,
} from '@auto-nomos/shared-types';

export interface DeriveSpanRow {
  id: string;
  agentId: string;
  parentSpanId: string | null;
  receiptId: string;
  parentReceiptId: string | null;
  toolName: string;
  status: SpanStatus;
  httpStatus: number | null;
  latencyMs: number;
  startedAt: string;
  // P1 — propagated onto SpanGraphNode so the UI can label outgoing edges
  // with the declared target DID without a second query.
  handoffToDid: string | null;
}

export interface DeriveAgentRow {
  id: string;
  name: string;
  did: string;
  depth: number | null;
}

export interface DeriveSpanTreeResult {
  nodes: SpanGraphNode[];
  edges: ActionGraphEdge[];
  agents: Record<string, AgentGraphNode>;
}

/**
 * djb2-xor → stable 0..359 hue from a DID. Pure function so the color is
 * deterministic across reloads and reproducible in tests.
 */
export function colorForDid(did: string): string {
  let h = 5381;
  for (let i = 0; i < did.length; i++) {
    h = ((h << 5) + h) ^ did.charCodeAt(i);
  }
  const hue = (h >>> 0) % 360;
  return `hsl(${hue} 70% 58%)`;
}

export function deriveSpanTree(
  spanRows: DeriveSpanRow[],
  agentRows: DeriveAgentRow[],
): DeriveSpanTreeResult {
  const sorted = [...spanRows].sort((a, b) => {
    const at = Date.parse(a.startedAt);
    const bt = Date.parse(b.startedAt);
    if (at !== bt) return at - bt;
    return a.id.localeCompare(b.id);
  });

  const spanById = new Map<string, DeriveSpanRow>();
  const spanByReceipt = new Map<string, string>();
  for (const s of sorted) {
    spanById.set(s.id, s);
    spanByReceipt.set(s.receiptId, s.id);
  }

  type Derivation = 'explicit' | 'sequential' | null;
  const parentOf = new Map<string, string | null>();
  const derivationOf = new Map<string, Derivation>();
  const lastByAgent = new Map<string, string>();

  for (const s of sorted) {
    let parent: string | null = null;
    let how: Derivation = null;

    if (s.parentSpanId && spanById.has(s.parentSpanId)) {
      parent = s.parentSpanId;
      how = 'explicit';
    } else if (s.parentReceiptId) {
      const resolved = spanByReceipt.get(s.parentReceiptId);
      if (resolved && resolved !== s.id) {
        parent = resolved;
        how = 'explicit';
      }
    }
    if (!parent) {
      const prior = lastByAgent.get(s.agentId);
      if (prior && prior !== s.id) {
        parent = prior;
        how = 'sequential';
      }
    }

    parentOf.set(s.id, parent);
    derivationOf.set(s.id, how);
    lastByAgent.set(s.agentId, s.id);
  }

  const rootCache = new Map<string, string>();
  function rootOf(id: string): string {
    const cached = rootCache.get(id);
    if (cached) return cached;
    let cur = id;
    const seen = new Set<string>();
    while (true) {
      if (seen.has(cur)) break;
      seen.add(cur);
      const p = parentOf.get(cur);
      if (!p) break;
      cur = p;
    }
    for (const v of seen) rootCache.set(v, cur);
    return cur;
  }

  const spansPerAgent = new Map<string, number>();
  for (const s of sorted) {
    spansPerAgent.set(s.agentId, (spansPerAgent.get(s.agentId) ?? 0) + 1);
  }

  const agents: Record<string, AgentGraphNode> = {};
  for (const a of agentRows) {
    agents[a.id] = {
      id: a.id,
      label: a.name,
      did: a.did,
      depth: a.depth,
      spanCount: spansPerAgent.get(a.id) ?? 0,
      color: colorForDid(a.did),
    };
  }

  const nodes: SpanGraphNode[] = sorted.map((s) => {
    const a = agents[s.agentId];
    return {
      kind: 'span',
      id: s.id,
      agentId: s.agentId,
      agentDid: a?.did ?? '',
      agentLabel: a?.label ?? s.agentId,
      agentColor: a?.color ?? colorForDid(s.agentId),
      effectiveParentId: parentOf.get(s.id) ?? null,
      rootSpanId: rootOf(s.id),
      toolName: s.toolName,
      status: s.status,
      latencyMs: s.latencyMs,
      httpStatus: s.httpStatus,
      startedAt: s.startedAt,
      handoffToDid: s.handoffToDid,
    };
  });

  const edges: ActionGraphEdge[] = [];
  for (const s of sorted) {
    const parent = parentOf.get(s.id);
    if (!parent) continue;
    const parentRow = spanById.get(parent);
    if (!parentRow) continue;
    const how = derivationOf.get(s.id);
    const kind: ActionGraphEdge['kind'] =
      parentRow.agentId !== s.agentId ? 'spawn' : how === 'sequential' ? 'sequential' : 'parent';
    edges.push({
      id: `${parent}->${s.id}`,
      from: parent,
      to: s.id,
      kind,
    });
  }

  return { nodes, edges, agents };
}
