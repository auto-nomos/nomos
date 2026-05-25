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
  HandoffMatch,
  HandoffMatchStatus,
  SpanGraphNode,
  SpanStatus,
} from '@auto-nomos/shared-types';

/**
 * P3 — window past which a child span is "late" instead of "matched". Five
 * minutes is the p99 fork-to-first-call latency observed in 2026-05 dogfood
 * traces; tune per-customer only if a real complaint surfaces.
 */
const HANDOFF_MATCH_WINDOW_MS = 5 * 60 * 1000;
/**
 * After this point even a candidate that would otherwise be `late` is
 * treated as `missing`. Stops a long-running swarm from accidentally
 * matching a child fork hours later.
 */
const HANDOFF_LATE_CUTOFF_MS = 60 * 60 * 1000;

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
  // P3 — needed by the matching algorithm to populate HandoffMatch.declaredTask
  // without an extra round-trip to the spans table.
  handoffTask: string | null;
  /**
   * P2 — cheap presence flag derived from a LEFT JOIN against
   * agent_span_prompts in the actionGraph SQL. UI uses it to show a
   * Sparkles icon and gate the Prompt tab without leaking content.
   */
  hasPrompt: boolean;
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
  /** P3 — one entry per source span that declared a handoff. */
  handoffMatches: HandoffMatch[];
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
      hasPrompt: s.hasPrompt,
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

  // ── P3 ── planned-vs-actual handoff diff ──────────────────────────────
  // For each source span that declared `handoff_to_did = D`, find the
  // earliest later span whose agent sits at parent.depth + 1 within a
  // 5-minute window. Depth comes from the agent registration (sidecar
  // `agents` map), not per-call chain_depth — see plan rationale.
  const handoffMatches: HandoffMatch[] = [];
  const matchByEdgeId = new Map<string, HandoffMatch>();
  for (const s of sorted) {
    if (!s.handoffToDid) continue;
    const sAgent = agents[s.agentId];
    if (!sAgent || sAgent.depth === null) continue;
    const sEnd = Date.parse(s.startedAt) + s.latencyMs;
    const targetDepth = sAgent.depth + 1;
    let inWindow: DeriveSpanRow | null = null;
    let lateCandidate: DeriveSpanRow | null = null;
    for (const c of sorted) {
      if (c.id === s.id) continue;
      const cAgent = agents[c.agentId];
      if (!cAgent || cAgent.depth !== targetDepth) continue;
      const cStart = Date.parse(c.startedAt);
      if (cStart <= sEnd) continue;
      const dt = cStart - sEnd;
      if (dt <= HANDOFF_MATCH_WINDOW_MS) {
        // earliest-wins inside the window
        if (!inWindow || cStart < Date.parse(inWindow.startedAt)) inWindow = c;
      } else if (dt <= HANDOFF_LATE_CUTOFF_MS) {
        if (!lateCandidate || cStart < Date.parse(lateCandidate.startedAt)) lateCandidate = c;
      }
    }
    let actual: DeriveSpanRow | null = inWindow;
    let status: HandoffMatchStatus;
    if (inWindow) {
      const cAgent = agents[inWindow.agentId]!;
      status = cAgent.did === s.handoffToDid ? 'matched' : 'wrong_agent';
    } else if (lateCandidate) {
      actual = lateCandidate;
      const cAgent = agents[lateCandidate.agentId]!;
      // Late + wrong agent is still "wrong_agent" — the routing error
      // is the salient signal; the lateness is a secondary modifier.
      status = cAgent.did === s.handoffToDid ? 'late' : 'wrong_agent';
    } else {
      status = 'missing';
    }
    const actualAgentDid = actual ? (agents[actual.agentId]?.did ?? null) : null;
    const latencyMs = actual ? Date.parse(actual.startedAt) - sEnd : null;
    const match: HandoffMatch = {
      sourceSpanId: s.id,
      declaredToDid: s.handoffToDid,
      declaredTask: s.handoffTask ?? '',
      actualSpanId: actual?.id ?? null,
      actualAgentDid,
      status,
      latencyMs,
    };
    handoffMatches.push(match);
    if (actual) matchByEdgeId.set(`${s.id}->${actual.id}`, match);
  }
  for (const e of edges) {
    const m = matchByEdgeId.get(e.id);
    if (m) e.handoffMatch = m;
  }

  return { nodes, edges, agents, handoffMatches };
}
