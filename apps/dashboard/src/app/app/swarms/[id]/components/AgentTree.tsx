'use client';

import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface Node {
  id: string;
  name: string;
  did: string;
  depth: number;
  children: Node[];
}

const COLLAPSE_PAST_DEPTH = 3;

export function AgentTree({ roots }: { roots: Node[] }) {
  if (!roots.length) {
    return <p className="text-sm text-muted-foreground">No agents in this swarm yet.</p>;
  }
  return (
    <ul className="space-y-1 font-mono text-xs">
      {roots.map((r) => (
        <Branch key={r.id} node={r} initialOpen />
      ))}
    </ul>
  );
}

function Branch({ node, initialOpen = false }: { node: Node; initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen || node.depth < COLLAPSE_PAST_DEPTH);
  const hasChildren = node.children.length > 0;
  return (
    <li>
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:underline"
        onClick={() => hasChildren && setOpen(!open)}
      >
        {hasChildren ? (
          <ChevronRight className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`} />
        ) : (
          <span className="inline-block h-3 w-3" />
        )}
        <span className="font-medium">{node.name}</span>
        <span className="text-muted-foreground">depth={node.depth}</span>
        <span className="text-muted-foreground">{node.did.slice(0, 16)}…</span>
      </button>
      {hasChildren && open && (
        <ul className="ml-5 space-y-1 border-l border-border pl-2">
          {node.children.map((c) => (
            <Branch key={c.id} node={c} />
          ))}
        </ul>
      )}
    </li>
  );
}
