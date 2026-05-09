'use client';

import { type Edge, Handle, type Node, type NodeProps, Position, ReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useMemo } from 'react';
import type {
  ActionConstraint,
  Clause,
  Condition,
  PrincipalConstraint,
  ResourceConstraint,
  VisualPolicy,
} from '../ir.js';

export interface PolicyBuilderProps {
  policy: VisualPolicy;
  onChange: (next: VisualPolicy) => void;
  /** Optional schema hints — surfaces action ids in the action node's hints. */
  schemaActions?: string[];
  /** Force read-only when the dashboard is replaying audit. */
  readOnly?: boolean;
}

interface HeadNodeData extends Record<string, unknown> {
  kind: 'principal' | 'action' | 'resource';
  summary: string;
  onClick(): void;
}

interface ConditionNodeData extends Record<string, unknown> {
  index: number;
  cond: Condition;
  onClick(): void;
  onDelete(): void;
  readOnly: boolean;
}

const HEAD_HEIGHT = 80;

export function PolicyBuilder({ policy, onChange, readOnly = false }: PolicyBuilderProps) {
  const nodes: Node[] = useMemo(() => {
    const principalSummary = principalLabel(policy.principal);
    const actionSummary = actionLabel(policy.action);
    const resourceSummary = resourceLabel(policy.resource);

    const headNodes: Node<HeadNodeData>[] = [
      {
        id: 'principal',
        type: 'head',
        position: { x: 0, y: 20 },
        data: {
          kind: 'principal',
          summary: principalSummary,
          onClick: () => onChange({ ...policy, principal: cyclePrincipal(policy.principal) }),
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      },
      {
        id: 'action',
        type: 'head',
        position: { x: 240, y: 20 },
        data: {
          kind: 'action',
          summary: actionSummary,
          onClick: () => onChange({ ...policy, action: cycleAction(policy.action) }),
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      },
      {
        id: 'resource',
        type: 'head',
        position: { x: 480, y: 20 },
        data: {
          kind: 'resource',
          summary: resourceSummary,
          onClick: () => onChange({ ...policy, resource: cycleResource(policy.resource) }),
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      },
    ];

    const conditionNodes: Node<ConditionNodeData>[] = policy.conditions.map((c, i) => ({
      id: `cond-${i}`,
      type: 'condition',
      position: { x: 240 + i * 240, y: 180 },
      data: {
        index: i,
        cond: c,
        readOnly,
        onClick: () =>
          onChange({
            ...policy,
            conditions: policy.conditions.map((cur, idx) =>
              idx === i ? { ...cur, kind: cur.kind === 'when' ? 'unless' : 'when' } : cur,
            ),
          }),
        onDelete: () =>
          onChange({
            ...policy,
            conditions: policy.conditions.filter((_, idx) => idx !== i),
          }),
      },
      sourcePosition: Position.Top,
      targetPosition: Position.Top,
    }));

    return [...headNodes, ...conditionNodes];
  }, [policy, onChange, readOnly]);

  const edges: Edge[] = useMemo(() => {
    const head: Edge[] = [
      { id: 'p-a', source: 'principal', target: 'action', type: 'smoothstep' },
      { id: 'a-r', source: 'action', target: 'resource', type: 'smoothstep' },
    ];
    const cond: Edge[] = policy.conditions.map((_, i) => ({
      id: `a-cond-${i}`,
      source: 'action',
      target: `cond-${i}`,
      type: 'smoothstep',
      animated: true,
    }));
    return [...head, ...cond];
  }, [policy.conditions]);

  return (
    <div
      data-testid="policy-builder-canvas"
      style={{
        height: `${HEAD_HEIGHT + 200 + Math.max(0, policy.conditions.length) * 20}px`,
        minHeight: 280,
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        proOptions={{ hideAttribution: true }}
        nodesDraggable={!readOnly}
        nodesConnectable={false}
        elementsSelectable={!readOnly}
      />
    </div>
  );
}

function HeadNode(props: NodeProps) {
  const data = props.data as HeadNodeData;
  return (
    <button
      type="button"
      onClick={data.onClick}
      style={{
        padding: '10px 14px',
        border: '1px solid hsl(214.3 31.8% 91.4%)',
        borderRadius: 6,
        background: 'hsl(0 0% 100%)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        minWidth: 180,
        cursor: 'pointer',
        fontFamily: 'inherit',
        textAlign: 'left',
      }}
    >
      <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'hsl(215.4 16.3% 46.9%)' }}>
        {data.kind}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{data.summary}</div>
      <Handle type="target" position={Position.Left} style={{ visibility: 'hidden' }} />
      <Handle type="source" position={Position.Right} style={{ visibility: 'hidden' }} />
    </button>
  );
}

function ConditionNode(props: NodeProps) {
  const data = props.data as ConditionNodeData;
  return (
    <div
      style={{
        padding: '10px 14px',
        border: '1px dashed hsl(214.3 31.8% 91.4%)',
        borderRadius: 6,
        background: 'hsl(210 40% 98%)',
        minWidth: 200,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 600 }}>{data.cond.kind}</span>
        {!data.readOnly && (
          <button
            type="button"
            onClick={data.onDelete}
            style={{
              fontSize: 11,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'hsl(0 84.2% 60.2%)',
            }}
          >
            remove
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={data.onClick}
        disabled={data.readOnly}
        style={{
          marginTop: 4,
          fontSize: 12,
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          textAlign: 'left',
          width: '100%',
          background: 'transparent',
          border: 'none',
          cursor: data.readOnly ? 'default' : 'pointer',
          padding: 0,
        }}
        title={data.readOnly ? undefined : 'click to flip when ↔ unless'}
      >
        {clauseLabel(data.cond.clause)}
      </button>
      <Handle type="target" position={Position.Top} style={{ visibility: 'hidden' }} />
    </div>
  );
}

const NODE_TYPES = {
  head: HeadNode,
  condition: ConditionNode,
};

/* ------------------------------------------------------------------ */
/* Pure helpers (also exported for the dashboard's side panel forms)  */
/* ------------------------------------------------------------------ */

export function principalLabel(c: PrincipalConstraint): string {
  switch (c.kind) {
    case 'all':
      return 'any agent';
    case 'eq':
      return `${c.entity.type}::"${c.entity.id}"`;
    case 'is':
      return `is ${c.type}`;
  }
}

export function actionLabel(c: ActionConstraint): string {
  switch (c.kind) {
    case 'all':
      return 'any action';
    case 'eq':
      return `Action::"${c.id}"`;
    case 'in':
      return `in [${c.ids.map((id) => `"${id}"`).join(', ')}]`;
  }
}

export function resourceLabel(c: ResourceConstraint): string {
  switch (c.kind) {
    case 'all':
      return 'any resource';
    case 'eq':
      return `${c.entity.type}::"${c.entity.id}"`;
    case 'is':
      return `is ${c.type}`;
  }
}

export function clauseLabel(c: Clause): string {
  switch (c.kind) {
    case 'attr_eq':
      return `${c.path} == ${JSON.stringify(c.value)}`;
    case 'attr_in':
      return `${c.path} in [${c.values.map((v) => JSON.stringify(v)).join(', ')}]`;
    case 'numeric_cmp':
      return `${c.path} ${c.op} ${c.value}`;
    case 'time_window_hour':
      return `${c.path} in [${c.startHour}, ${c.endHour})`;
    case 'has_attr':
      return `has ${c.path}`;
    case 'raw':
      return c.cedar.length > 60 ? `${c.cedar.slice(0, 57)}…` : c.cedar;
  }
}

function cyclePrincipal(c: PrincipalConstraint): PrincipalConstraint {
  if (c.kind === 'all') return { kind: 'is', type: 'Agent' };
  if (c.kind === 'is') return { kind: 'eq', entity: { type: 'Agent', id: 'agent-id' } };
  return { kind: 'all' };
}

function cycleAction(c: ActionConstraint): ActionConstraint {
  if (c.kind === 'all') return { kind: 'eq', id: 'read' };
  if (c.kind === 'eq') return { kind: 'in', ids: [c.id, 'list'] };
  return { kind: 'all' };
}

function cycleResource(c: ResourceConstraint): ResourceConstraint {
  if (c.kind === 'all') return { kind: 'is', type: 'Resource' };
  if (c.kind === 'is') return { kind: 'eq', entity: { type: c.type, id: 'r-1' } };
  return { kind: 'all' };
}
