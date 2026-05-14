'use client';

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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Bot, Wrench } from 'lucide-react';
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
const NODE_W_AGENT = 220;
const NODE_H_AGENT = 64;
const NODE_W_SPAN = 200;
const NODE_H_SPAN = 80;

type AgentData = {
  kind: 'agent';
  label: string;
  did: string;
  spanCount: number;
};

type SpanData = {
  kind: 'span';
  toolName: string;
  status: 'success' | 'failure' | 'timeout' | 'denied';
  latencyMs: number;
  httpStatus: number | null;
};

const nodeTypes = {
  agent: AgentNode,
  span: SpanNode,
};

export function ActionGraph({ swarmId }: { swarmId?: string }) {
  const [openSpan, setOpenSpan] = useState<string | null>(null);
  const q = trpc.observability.actionGraph.useQuery(
    swarmId ? { swarmId, sinceMinutes: 60 } : { sinceMinutes: 60 },
    { refetchInterval: POLL_MS },
  );

  const layout = useMemo(() => {
    if (!q.data) return { nodes: [], edges: [] };
    return buildLayout(q.data);
  }, [q.data]);

  const empty = !q.data || layout.nodes.length === 0;

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
          What each agent actually did, not just what it was allowed to do. Agents on the left, tool
          calls flowing right. Click a span node to inspect.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {empty ? (
          <div className="flex h-[320px] items-center justify-center rounded-md border border-dashed bg-muted/10 text-sm text-muted-foreground">
            No tool calls in the last 60 minutes. Drive a flow to see the graph populate.
          </div>
        ) : (
          <div className="h-[480px] w-full overflow-hidden rounded-md border bg-background">
            <ReactFlowProvider>
              <ReactFlow
                nodes={layout.nodes}
                edges={layout.edges}
                nodeTypes={nodeTypes}
                fitView
                minZoom={0.4}
                maxZoom={1.5}
                proOptions={{ hideAttribution: true }}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable
                onNodeClick={(_, node) => {
                  if (node.type === 'span') {
                    setOpenSpan(node.id);
                  }
                }}
              >
                <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
              </ReactFlow>
            </ReactFlowProvider>
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

function AgentNode({ data }: NodeProps) {
  const d = data as AgentData;
  return (
    <div className="rounded-md border-2 border-aegis-iris/60 bg-aegis-iris/10 px-3 py-2 shadow-sm">
      <Handle type="source" position={Position.Right} className="!bg-aegis-iris" />
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-aegis-iris" />
        <span className="text-sm font-medium">{d.label}</span>
      </div>
      <div className="mt-1 font-mono text-[10px] text-muted-foreground">{shortId(d.did)}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wider text-aegis-mute">
        {d.spanCount} call{d.spanCount === 1 ? '' : 's'}
      </div>
    </div>
  );
}

function SpanNode({ data }: NodeProps) {
  const d = data as SpanData;
  const tone =
    d.status === 'success'
      ? 'border-aegis-signal/60 bg-aegis-signal/10'
      : d.status === 'denied'
        ? 'border-aegis-amber/60 bg-aegis-amber/10'
        : 'border-aegis-coral/60 bg-aegis-coral/10';
  return (
    <div className={`rounded-md border-2 px-3 py-2 shadow-sm ${tone}`}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="flex items-center gap-2">
        <Wrench className="h-3.5 w-3.5" />
        <code className="text-xs">{d.toolName}</code>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <Badge
          variant={
            d.status === 'success' ? 'default' : d.status === 'denied' ? 'secondary' : 'destructive'
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
    </div>
  );
}

function buildLayout(data: {
  nodes: Array<
    | {
        kind: 'agent';
        id: string;
        label: string;
        did: string;
        depth: number | null;
        spanCount: number;
      }
    | {
        kind: 'span';
        id: string;
        agentId: string;
        toolName: string;
        status: 'success' | 'failure' | 'timeout' | 'denied';
        latencyMs: number;
        httpStatus: number | null;
        startedAt: string;
      }
  >;
  edges: Array<{ id: string; from: string; to: string; kind: 'invokes' | 'handoff' }>;
}): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 24, ranksep: 56, marginx: 16, marginy: 16 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of data.nodes) {
    g.setNode(
      n.id,
      n.kind === 'agent'
        ? { width: NODE_W_AGENT, height: NODE_H_AGENT }
        : { width: NODE_W_SPAN, height: NODE_H_SPAN },
    );
  }
  for (const e of data.edges) {
    g.setEdge(e.from, e.to);
  }
  dagre.layout(g);

  const nodes: Node[] = data.nodes.map((n) => {
    const pos = g.node(n.id);
    if (n.kind === 'agent') {
      return {
        id: n.id,
        type: 'agent',
        position: { x: pos.x - NODE_W_AGENT / 2, y: pos.y - NODE_H_AGENT / 2 },
        data: {
          kind: 'agent',
          label: n.label,
          did: n.did,
          spanCount: n.spanCount,
        } satisfies AgentData,
      };
    }
    return {
      id: n.id,
      type: 'span',
      position: { x: pos.x - NODE_W_SPAN / 2, y: pos.y - NODE_H_SPAN / 2 },
      data: {
        kind: 'span',
        toolName: n.toolName,
        status: n.status,
        latencyMs: n.latencyMs,
        httpStatus: n.httpStatus,
      } satisfies SpanData,
    };
  });

  const edges: Edge[] = data.edges.map((e) => ({
    id: e.id,
    source: e.from,
    target: e.to,
    type: 'smoothstep',
    style:
      e.kind === 'handoff'
        ? { stroke: 'rgb(165 180 252)', strokeDasharray: '4 3' }
        : { stroke: 'rgb(148 163 184 / 0.7)' },
    animated: e.kind === 'handoff',
  }));

  return { nodes, edges };
}
