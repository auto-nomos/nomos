'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../../../components/ui/card';
import { trpc } from '../../../../../lib/trpc';

export function BlastRadius({ swarmId }: { swarmId: string }) {
  const q = trpc.observability.blastRadius.useQuery({ swarmId, windowDays: 7 });
  if (q.isLoading) return null;
  const data = q.data;
  if (!data) return null;

  const worst = [...data.byAgent].sort(
    (a, b) =>
      b.canCommands.length +
      Number(b.wildcard) * 1000 -
      (a.canCommands.length + Number(a.wildcard) * 1000),
  )[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Blast radius</CardTitle>
        <CardDescription>
          Aggregate reach across this swarm — what is exposed if any single agent in the chain is
          compromised.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3 text-sm">
          <Tile
            label="Commands reachable"
            value={data.commandsReachable.length.toString()}
            sub={data.commandsReachable.slice(0, 4).join(', ') || '—'}
          />
          <Tile
            label="Resources touched"
            value={data.resourcesReachable.toString()}
            sub="distinct over 7d"
          />
          <Tile
            label="Integrations"
            value={data.integrationsReachable.length.toString()}
            sub={data.integrationsReachable.join(', ') || '—'}
          />
        </div>

        {worst ? (
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
            <span className="font-semibold">Highest exposure:</span>{' '}
            <span className="font-mono">{worst.agentName}</span> —{' '}
            {worst.wildcard
              ? 'wildcard policy (ANY command permitted)'
              : `${worst.canCommands.length} permitted commands, ${worst.didCommands.length} used`}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-2xl tabular-nums">{value}</div>
      <div className="mt-1 truncate font-mono text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}
