'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Button } from '../../../../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../../../components/ui/card';
import { trpc } from '../../../../../lib/trpc';

interface AgentLite {
  id: string;
  name: string;
  swarmId: string | null;
  depth?: number | null;
}

export function AttachChildCard({
  swarmId,
  swarmAgents,
}: {
  swarmId: string;
  swarmAgents: { id: string; name: string; depth: number }[];
}) {
  const all = trpc.agents.list.useQuery();
  const utils = trpc.useUtils();
  const attach = trpc.swarms.attachChild.useMutation({
    onSuccess: () => {
      utils.swarms.tree.invalidate({ id: swarmId });
      utils.swarms.scopeContainment.invalidate({ id: swarmId });
      setChildAgentId('');
    },
  });
  const [parentAgentId, setParentAgentId] = useState('');
  const [childAgentId, setChildAgentId] = useState('');

  const candidates: AgentLite[] = useMemo(
    () =>
      (all.data ?? []).filter((a) => a.swarmId === null && !swarmAgents.find((s) => s.id === a.id)),
    [all.data, swarmAgents],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Attach child agent</CardTitle>
        <CardDescription>
          Hook an existing App into this swarm as a child of one of the agents below. The child's
          UCAN chain must already root at the swarm root — the PDP enforces continuity at runtime;
          this UI only records the tree shape.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <select
            value={parentAgentId}
            onChange={(e) => setParentAgentId(e.target.value)}
            className="rounded border px-2 text-sm"
          >
            <option value="">parent agent…</option>
            {swarmAgents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} (depth {a.depth})
              </option>
            ))}
          </select>
          <select
            value={childAgentId}
            onChange={(e) => setChildAgentId(e.target.value)}
            className="rounded border px-2 text-sm"
          >
            <option value="">child app to attach…</option>
            {candidates.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <Button
            onClick={() => attach.mutate({ swarmId, agentId: childAgentId, parentAgentId })}
            disabled={!parentAgentId || !childAgentId || attach.isPending}
          >
            <Plus className="mr-1 h-4 w-4" />
            Attach
          </Button>
        </div>
        {candidates.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No unattached Apps available.{' '}
            <Link href="/app/agents/new" className="underline">
              Create one
            </Link>{' '}
            first, then come back to attach it.
          </p>
        )}
        {attach.error && <p className="text-xs text-destructive">{attach.error.message}</p>}
        {attach.isSuccess && (
          <p className="text-xs text-green-600">Attached. Refresh the tree to see it.</p>
        )}
      </CardContent>
    </Card>
  );
}
