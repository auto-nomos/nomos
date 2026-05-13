'use client';

import { useState } from 'react';
import { Button } from '../../../../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../../../components/ui/card';
import { Input } from '../../../../../components/ui/input';
import { trpc } from '../../../../../lib/trpc';

/**
 * Sprint MAOS-B — swarm-scoped step-up approval composer.
 *
 * The operator picks a root agent within the swarm; the preview shows the
 * snapshot of current children that the approval will cover. Children
 * forked after this approval do NOT inherit it — never auto-extend.
 */
export function ChainApprovalCard({
  swarmId,
  rootAgents,
}: {
  swarmId: string;
  rootAgents: { id: string; name: string }[];
}) {
  const [rootAgentId, setRootAgentId] = useState('');
  const [ttlHours, setTtlHours] = useState(24);
  const preview = trpc.chainApprovals.preview.useQuery({ rootAgentId }, { enabled: !!rootAgentId });
  const create = trpc.chainApprovals.create.useMutation();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Approve for chain</CardTitle>
        <CardDescription>
          Approve a step-up that covers a root agent and all current children. Snapshot only —
          children forked after approval need a fresh approval.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <select
            value={rootAgentId}
            onChange={(e) => setRootAgentId(e.target.value)}
            className="rounded border px-2 text-sm"
          >
            <option value="">pick root agent…</option>
            {rootAgents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <Input
            type="number"
            value={ttlHours}
            onChange={(e) => setTtlHours(Number(e.target.value))}
            className="w-24"
          />
          <span className="self-center text-sm text-muted-foreground">hours</span>
          <Button
            disabled={!rootAgentId || create.isPending}
            onClick={() =>
              create.mutate({
                rootAgentId,
                swarmId,
                scope: { source: 'swarm-view' },
                ttlSeconds: ttlHours * 3600,
              })
            }
          >
            Approve chain
          </Button>
        </div>
        {preview.data && (
          <div className="rounded border bg-muted/40 p-3 text-xs">
            <p className="mb-1 font-medium">
              Snapshot: {preview.data.agents.length} agent(s) — {preview.data.snapshotAt.toString()}
            </p>
            <ul className="list-disc pl-5">
              {preview.data.agents.map((a) => (
                <li key={a.id}>
                  {a.name} (depth {a.depth})
                </li>
              ))}
            </ul>
          </div>
        )}
        {create.isSuccess && create.data && (
          <p className="text-xs text-green-600">
            Approved. Expires{' '}
            {new Date(create.data.expiresAt as unknown as string).toLocaleString()}.
          </p>
        )}
        {create.error && <p className="text-xs text-destructive">{create.error.message}</p>}
      </CardContent>
    </Card>
  );
}
