'use client';

import type { ActionGraph as ActionGraphData, AgentGraphNode } from '@auto-nomos/shared-types';
import dagre from '@dagrejs/dagre';
import {
  Background,
  BackgroundVariant,
  type Edge,
  Handle,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Sparkles, Wrench } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../../../../../components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../../../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../../../../components/ui/dialog';
import { trpc } from '../../../../../lib/trpc';
import { shortId } from '../../../../../lib/utils';
import { SpanDetail } from './SpanDetail';

const POLL_MS = 5_000;
const NODE_W = 220;
const NODE_H = 88;
const GROUP_GAP = 56;

type SpanData = {
  toolName: string;
  status: 'success' | 'failure' | 'timeout' | 'denied';
  latencyMs: number;
  httpStatus: number | null;
  agentLabel: string;
  agentDid: string;
  agentColor: string;
  spawnsCount: number;
  handoffToDid: string | null;
};

const nodeTypes = { span: SpanNode };

export function ActionGraph({ swarmId, agentId }: { swarmId?: string; agentId?: string }) {
  const [openSpan, setOpenSpan] = useState<string | null>(null);
  const q = trpc.observability.actionGraph.useQuery(
    {
      sinceMinutes: 60,
      ...(swarmId ? { swarmId } : {}),
      ...(agentId ? { agentId } : {}),
    },
    { refetchInterval: POLL_MS },
  );

  const layout = useMemo(() => {
    if (!q.data)
      return {
        nodes: [],
        edges: [],
        conversations: [],
        agents: {} as Record<string, AgentGraphNode>,
      };
    return buildLayout(q.data);
  }, [q.data]);

  const empty = !q.data || layout.nodes.length === 0;
  const agentsList = Object.values(layout.agents);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Action graph{' '}
          <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
            polling every {POLL_MS / 1000}s · last 60min
          </span>
        </CardTitle>
        <CardDescription>
          Each conversation flows left to right. Forks mark sub-agent spawns. Click any span to
          inspect.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {empty ? (
          <div className="flex h-[320px] items-center justify-center rounded-md border border-dashed bg-muted/10 text-sm text-muted-foreground">
            No tool calls in the last 60 minutes. Drive a flow to see the graph populate.
          </div>
        ) : (
          <div className="space-y-3">
            {agentsList.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">Agents:</span>
                {agentsList.map((a) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2 py-0.5"
                  >
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: a.color }}
                    />
                    <span className="font-medium">{a.label}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {shortId(a.did)}
                    </span>
                  </span>
                ))}
              </div>
            ) : null}
            <div className="h-[480px] w-full overflow-hidden rounded-md border bg-background">
              <ReactFlowProvider>
                <Canvas
                  nodes={layout.nodes}
                  edges={layout.edges}
                  conversations={layout.conversations}
                  onSpanClick={(id) => setOpenSpan(id)}
                />
              </ReactFlowProvider>
            </div>
          </div>
        )}
      </CardContent>

      <Dialog open={openSpan !== null} onOpenChange={(o) => !o && setOpenSpan(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Span detail</DialogTitle>
            <DialogDescription>
              Post-execution telemetry — hashes, latency, redacted summary.
            </DialogDescription>
          </DialogHeader>
          {openSpan ? <SpanDetail spanId={openSpan} /> : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

interface Conversation {
  rootSpanId: string;
  rootTool: string;
  rootAgentLabel: string;
  rootColor: string;
  startedAt: string;
  nodeIds: string[];
}

function Canvas({
  nodes,
  edges,
  conversations,
  onSpanClick,
}: {
  nodes: Node[];
  edges: Edge[];
  conversations: Conversation[];
  onSpanClick: (id: string) => void;
}) {
  const flow = useReactFlow();

  return (
    <>
      {conversations.length > 1 ? (
        <div className="flex flex-wrap gap-1.5 border-b bg-muted/30 px-2 py-1.5 text-[11px]">
          {conversations.map((c) => (
            <button
              type="button"
              key={c.rootSpanId}
              onClick={() =>
                flow.fitView({
                  nodes: c.nodeIds.map((id) => ({ id })),
                  duration: 350,
                  padding: 0.15,
                })
              }
              className="inline-flex items-center gap-1.5 rounded border bg-background px-1.5 py-0.5 hover:bg-accent"
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: c.rootColor }}
              />
              <span className="font-mono">{c.rootTool}</span>
              <span className="text-muted-foreground">· {relativeTime(c.startedAt)}</span>
            </button>
          ))}
        </div>
      ) : null}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.4}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        onNodeClick={(_, node) => {
          if (node.type === 'span') onSpanClick(node.id);
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
      </ReactFlow>
    </>
  );
}

function SpanNode({ data }: NodeProps) {
  const d = data as SpanData;
  const tone =
    d.status === 'success'
      ? 'border-aegis-signal/60 bg-aegis-signal/5'
      : d.status === 'denied'
        ? 'border-aegis-amber/60 bg-aegis-amber/5'
        : d.status === 'failure' || d.status === 'timeout'
          ? 'border-aegis-coral/60 bg-aegis-coral/5'
          : 'border-aegis-mute/60 bg-background';
  return (
    <div
      className={`relative overflow-hidden rounded-md border-2 shadow-sm ${tone}`}
      style={{ width: NODE_W }}
    >
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: d.agentColor }}
      />
      <div className="space-y-1 px-3 py-2 pl-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <Wrench className="h-3.5 w-3.5 flex-shrink-0" />
            <code className="truncate text-xs">{d.toolName}</code>
          </div>
          {d.spawnsCount > 1 ? (
            <span
              className="inline-flex items-center gap-0.5 rounded bg-aegis-iris/15 px-1 py-0.5 text-[9px] font-medium text-aegis-iris"
              title={`spawns ${d.spawnsCount} sub-agents`}
            >
              <Sparkles className="h-2.5 w-2.5" />
              spawns {d.spawnsCount}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={
              d.status === 'success'
                ? 'default'
                : d.status === 'denied'
                  ? 'secondary'
                  : 'destructive'
            }
            className="px-1.5 py-0 text-[9px] uppercase"
          >
            {d.status}
          </Badge>
          <span className="font-mono text-[10px] text-muted-foreground">{d.latencyMs}ms</span>
          {d.httpStatus !== null ? (
            <span className="font-mono text-[10px] text-muted-foreground">{d.httpStatus}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5 text-[10px]">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: d.agentColor }}
          />
          <span className="truncate text-muted-foreground">
            {d.agentLabel} · <span className="font-mono">{shortId(d.agentDid)}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function buildLayout(data: ActionGraphData): {
  nodes: Node[];
  edges: Edge[];
  conversations: Conversation[];
  agents: Record<string, AgentGraphNode>;
} {
  if (data.nodes.length === 0) {
    return { nodes: [], edges: [], conversations: [], agents: data.agents };
  }

  // Group spans by rootSpanId so each conversation gets its own dagre pass.
  const byRoot = new Map<string, ActionGraphData['nodes']>();
  for (const n of data.nodes) {
    const arr = byRoot.get(n.rootSpanId) ?? [];
    arr.push(n);
    byRoot.set(n.rootSpanId, arr);
  }
  const edgesByRoot = new Map<string, ActionGraphData['edges']>();
  const rootOf = new Map<string, string>();
  for (const n of data.nodes) rootOf.set(n.id, n.rootSpanId);
  for (const e of data.edges) {
    const root = rootOf.get(e.to) ?? rootOf.get(e.from);
    if (!root) continue;
    const arr = edgesByRoot.get(root) ?? [];
    arr.push(e);
    edgesByRoot.set(root, arr);
  }

  // Tally cross-agent children per span to show "spawns N" badge.
  const spawnsByParent = new Map<string, number>();
  for (const e of data.edges) {
    if (e.kind === 'spawn') {
      spawnsByParent.set(e.from, (spawnsByParent.get(e.from) ?? 0) + 1);
    }
  }

  // Order conversations by their root's startedAt (oldest first).
  const rootStart = (rootId: string): number => {
    const root = data.nodes.find((n) => n.id === rootId);
    return root ? Date.parse(root.startedAt) : 0;
  };
  const roots = [...byRoot.keys()].sort((a, b) => rootStart(a) - rootStart(b));

  const flowNodes: Node[] = [];
  const conversations: Conversation[] = [];
  let yOffset = 0;

  for (const root of roots) {
    const subNodes = byRoot.get(root) ?? [];
    const subEdges = edgesByRoot.get(root) ?? [];

    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'LR', nodesep: 28, ranksep: 64, marginx: 16, marginy: 16 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const n of subNodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
    for (const e of subEdges) {
      if (g.hasNode(e.from) && g.hasNode(e.to)) g.setEdge(e.from, e.to);
    }
    dagre.layout(g);

    let maxY = 0;
    for (const n of subNodes) {
      const pos = g.node(n.id);
      const y = pos.y - NODE_H / 2 + yOffset;
      maxY = Math.max(maxY, y + NODE_H);
      flowNodes.push({
        id: n.id,
        type: 'span',
        position: { x: pos.x - NODE_W / 2, y },
        data: {
          toolName: n.toolName,
          status: n.status,
          latencyMs: n.latencyMs,
          httpStatus: n.httpStatus,
          agentLabel: n.agentLabel,
          agentDid: n.agentDid,
          agentColor: n.agentColor,
          spawnsCount: spawnsByParent.get(n.id) ?? 0,
          handoffToDid: n.handoffToDid,
        } satisfies SpanData,
      });
    }

    const rootNode = subNodes.find((n) => n.id === root);
    if (rootNode) {
      conversations.push({
        rootSpanId: root,
        rootTool: rootNode.toolName,
        rootAgentLabel: rootNode.agentLabel,
        rootColor: rootNode.agentColor,
        startedAt: rootNode.startedAt,
        nodeIds: subNodes.map((n) => n.id),
      });
    }

    yOffset = maxY + GROUP_GAP;
  }

  const flowEdges: Edge[] = data.edges.map((e) => {
    const child = data.nodes.find((n) => n.id === e.to);
    const parent = data.nodes.find((n) => n.id === e.from);
    const color = e.kind === 'spawn' && child ? child.agentColor : undefined;
    // P1 — label spawn edges whose parent declared a typed handoff. The
    // label points at the declared target DID; P3 will recolor when the
    // *actual* child DID diverges from the declared one.
    const handoffLabel =
      parent?.handoffToDid && e.kind === 'spawn' ? `→ ${shortId(parent.handoffToDid)}` : undefined;
    return {
      id: e.id,
      source: e.from,
      target: e.to,
      type: 'smoothstep',
      animated: e.kind === 'spawn',
      ...(handoffLabel
        ? {
            label: handoffLabel,
            labelStyle: { fontSize: 10, fontFamily: 'var(--font-mono, monospace)' },
            labelBgPadding: [4, 2] as [number, number],
            labelBgBorderRadius: 4,
            labelBgStyle: { fill: 'rgb(var(--aegis-iris) / 0.1)' },
          }
        : {}),
      style:
        e.kind === 'spawn'
          ? { stroke: color, strokeWidth: 2 }
          : e.kind === 'sequential'
            ? { stroke: 'rgb(148 163 184 / 0.35)', strokeWidth: 1 }
            : { stroke: 'rgb(148 163 184 / 0.7)', strokeWidth: 1.5 },
    };
  });

  return { nodes: flowNodes, edges: flowEdges, conversations, agents: data.agents };
}

function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const delta = Date.now() - t;
  if (delta < 60_000) return `${Math.max(1, Math.floor(delta / 1000))}s ago`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  return `${Math.floor(delta / 3_600_000)}h ago`;
}
