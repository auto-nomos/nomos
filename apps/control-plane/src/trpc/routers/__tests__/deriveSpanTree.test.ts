import { describe, expect, it } from 'vitest';
import {
  colorForDid,
  type DeriveAgentRow,
  type DeriveSpanRow,
  deriveSpanTree,
} from '../_deriveSpanTree.js';

function span(
  id: string,
  agentId: string,
  startedAtSec: number,
  overrides: Partial<DeriveSpanRow> = {},
): DeriveSpanRow {
  return {
    id,
    agentId,
    parentSpanId: null,
    receiptId: `rcpt-${id}`,
    parentReceiptId: null,
    toolName: `tool_${id}`,
    status: 'success',
    httpStatus: 200,
    latencyMs: 10,
    startedAt: new Date(1_700_000_000_000 + startedAtSec * 1000).toISOString(),
    handoffToDid: null,
    handoffTask: null,
    ...overrides,
  };
}

function agent(id: string, did = `did:key:${id}`, name = id, depth = 0): DeriveAgentRow {
  return { id, name, did, depth };
}

describe('deriveSpanTree', () => {
  it('chains same-agent calls sequentially when no explicit parent is set', () => {
    const spans = [span('a', 'agent-1', 0), span('b', 'agent-1', 1), span('c', 'agent-1', 2)];
    const tree = deriveSpanTree(spans, [agent('agent-1')]);

    const b = tree.nodes.find((n) => n.id === 'b')!;
    const c = tree.nodes.find((n) => n.id === 'c')!;
    expect(b.effectiveParentId).toBe('a');
    expect(c.effectiveParentId).toBe('b');

    const allRoots = new Set(tree.nodes.map((n) => n.rootSpanId));
    expect([...allRoots]).toEqual(['a']);

    const kinds = tree.edges.map((e) => e.kind).sort();
    expect(kinds).toEqual(['sequential', 'sequential']);
  });

  it('explicit parent_span_id wins over chronological fallback', () => {
    const spans = [
      span('root', 'agent-1', 0),
      span('mid', 'agent-1', 1),
      span('child', 'agent-1', 2, { parentSpanId: 'root' }),
    ];
    const tree = deriveSpanTree(spans, [agent('agent-1')]);

    const child = tree.nodes.find((n) => n.id === 'child')!;
    expect(child.effectiveParentId).toBe('root');
    const childEdge = tree.edges.find((e) => e.to === 'child')!;
    expect(childEdge.kind).toBe('parent');
  });

  it('parent_receipt_id resolves cross-agent as a spawn edge', () => {
    const spans = [
      span('parent', 'agent-1', 0),
      span('subagent-call', 'agent-2', 1, { parentReceiptId: 'rcpt-parent' }),
    ];
    const tree = deriveSpanTree(spans, [agent('agent-1'), agent('agent-2')]);

    const sub = tree.nodes.find((n) => n.id === 'subagent-call')!;
    expect(sub.effectiveParentId).toBe('parent');
    expect(sub.rootSpanId).toBe('parent');

    const edge = tree.edges.find((e) => e.to === 'subagent-call')!;
    expect(edge.kind).toBe('spawn');
  });

  it('detects a root span when its parent is outside the window', () => {
    const spans = [span('orphan', 'agent-1', 0, { parentSpanId: 'not-in-window' })];
    const tree = deriveSpanTree(spans, [agent('agent-1')]);

    const orphan = tree.nodes.find((n) => n.id === 'orphan')!;
    expect(orphan.effectiveParentId).toBeNull();
    expect(orphan.rootSpanId).toBe('orphan');
    expect(tree.edges).toHaveLength(0);
  });

  it('groups all descendants of a fork into the same conversation root', () => {
    // root → mid → spawn(subA) + spawn(subB), each subagent does one call
    const spans = [
      span('root', 'agent-1', 0),
      span('mid', 'agent-1', 1),
      span('subA-call', 'agent-2', 2, { parentSpanId: 'mid' }),
      span('subB-call', 'agent-3', 3, { parentSpanId: 'mid' }),
      span('subA-followup', 'agent-2', 4),
    ];
    const tree = deriveSpanTree(spans, [agent('agent-1'), agent('agent-2'), agent('agent-3')]);

    expect(new Set(tree.nodes.map((n) => n.rootSpanId))).toEqual(new Set(['root']));

    const subA = tree.edges.find((e) => e.to === 'subA-call')!;
    const subB = tree.edges.find((e) => e.to === 'subB-call')!;
    expect(subA.kind).toBe('spawn');
    expect(subB.kind).toBe('spawn');

    const followup = tree.edges.find((e) => e.to === 'subA-followup')!;
    expect(followup.from).toBe('subA-call');
    expect(followup.kind).toBe('sequential');
  });

  it('emits an agents map with deterministic colors per DID', () => {
    const tree = deriveSpanTree(
      [span('x', 'agent-1', 0), span('y', 'agent-2', 1, { parentSpanId: 'x' })],
      [agent('agent-1', 'did:key:zABC'), agent('agent-2', 'did:key:zDEF')],
    );
    expect(Object.keys(tree.agents).sort()).toEqual(['agent-1', 'agent-2']);
    expect(tree.agents['agent-1']!.color).toBe(colorForDid('did:key:zABC'));
    expect(tree.agents['agent-2']!.color).toBe(colorForDid('did:key:zDEF'));
    expect(tree.agents['agent-1']!.color).not.toBe(tree.agents['agent-2']!.color);
  });

  it('falls back gracefully when a span references a missing receipt', () => {
    const spans = [
      span('a', 'agent-1', 0),
      span('b', 'agent-1', 1, { parentReceiptId: 'rcpt-nowhere' }),
    ];
    const tree = deriveSpanTree(spans, [agent('agent-1')]);
    // 'b' should still chain to 'a' via the sequential fallback rather than orphan.
    const b = tree.nodes.find((n) => n.id === 'b')!;
    expect(b.effectiveParentId).toBe('a');
    const edge = tree.edges.find((e) => e.to === 'b')!;
    expect(edge.kind).toBe('sequential');
  });

  describe('P3 handoff matching', () => {
    // Helper: parent at depth=0 declares handoff → child at depth=1.
    const parentAgent = agent('parent', 'did:key:zparent', 'parent', 0);
    const childAgent = agent('child', 'did:key:zchild', 'child', 1);
    const wrongAgent = agent('rogue', 'did:key:zrogue', 'rogue', 1);

    it('matches when the declared DID arrives at depth+1 within 5 minutes', () => {
      const spans = [
        span('s', 'parent', 0, { handoffToDid: 'did:key:zchild', handoffTask: 'do the thing' }),
        span('c', 'child', 30, { parentSpanId: 's' }),
      ];
      const tree = deriveSpanTree(spans, [parentAgent, childAgent]);
      expect(tree.handoffMatches).toHaveLength(1);
      const m = tree.handoffMatches[0]!;
      expect(m.status).toBe('matched');
      expect(m.sourceSpanId).toBe('s');
      expect(m.actualSpanId).toBe('c');
      expect(m.actualAgentDid).toBe('did:key:zchild');
      expect(m.declaredTask).toBe('do the thing');
      // Edge from s → c carries the same match outcome.
      const edge = tree.edges.find((e) => e.id === 's->c')!;
      expect(edge.handoffMatch?.status).toBe('matched');
    });

    it('flags wrong_agent when a sub-agent arrives at depth+1 but DID differs', () => {
      const spans = [
        span('s', 'parent', 0, { handoffToDid: 'did:key:zchild', handoffTask: 'route to child' }),
        span('r', 'rogue', 20, { parentSpanId: 's' }),
      ];
      const tree = deriveSpanTree(spans, [parentAgent, childAgent, wrongAgent]);
      const m = tree.handoffMatches[0]!;
      expect(m.status).toBe('wrong_agent');
      expect(m.actualAgentDid).toBe('did:key:zrogue');
      const edge = tree.edges.find((e) => e.id === 's->r')!;
      expect(edge.handoffMatch?.status).toBe('wrong_agent');
    });

    it('flags missing when no child appears at all', () => {
      const spans = [
        span('s', 'parent', 0, { handoffToDid: 'did:key:zchild', handoffTask: 'lonely' }),
      ];
      const tree = deriveSpanTree(spans, [parentAgent, childAgent]);
      const m = tree.handoffMatches[0]!;
      expect(m.status).toBe('missing');
      expect(m.actualSpanId).toBeNull();
      expect(m.actualAgentDid).toBeNull();
      expect(m.latencyMs).toBeNull();
    });

    it('flags late when the right child appears past the 5-minute window', () => {
      // Span s ends at t=0+10ms; child starts at t=600s — 10x past the window.
      const spans = [
        span('s', 'parent', 0, { handoffToDid: 'did:key:zchild', handoffTask: 'slow' }),
        span('c', 'child', 600, { parentSpanId: 's' }),
      ];
      const tree = deriveSpanTree(spans, [parentAgent, childAgent]);
      const m = tree.handoffMatches[0]!;
      expect(m.status).toBe('late');
      expect(m.actualSpanId).toBe('c');
      // Edge still gets the match so the UI can recolor it amber.
      expect(tree.edges.find((e) => e.id === 's->c')!.handoffMatch?.status).toBe('late');
    });

    it('does not match siblings at the same depth (no chain-depth false-positive)', () => {
      // Both parent and "child" are at depth 0 — sibling, not sub-agent.
      const sib = agent('sib', 'did:key:zchild', 'sib', 0);
      const spans = [
        span('s', 'parent', 0, { handoffToDid: 'did:key:zchild', handoffTask: 'x' }),
        span('c', 'sib', 30),
      ];
      const tree = deriveSpanTree(spans, [parentAgent, sib]);
      // sib has the right DID but is at depth 0, not 1 → no match.
      expect(tree.handoffMatches[0]!.status).toBe('missing');
    });

    it('emits no matches for spans without handoffToDid', () => {
      const spans = [span('s', 'parent', 0), span('c', 'child', 30, { parentSpanId: 's' })];
      const tree = deriveSpanTree(spans, [parentAgent, childAgent]);
      expect(tree.handoffMatches).toHaveLength(0);
    });
  });
});
