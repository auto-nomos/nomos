'use client';

import { AlertTriangle, FileSearch, GitBranch, Globe2 } from 'lucide-react';
import { Badge } from '../../../../../components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../../../components/ui/card';
import { trpc } from '../../../../../lib/trpc';

const POLL_MS = 15_000;

type AnomalyKind = 'new_command' | 'deny_spike' | 'depth_spike' | 'resource_widened';

const KIND_META: Record<
  AnomalyKind,
  { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }
> = {
  new_command: { label: 'New command', icon: Globe2, tone: 'text-aegis-iris' },
  deny_spike: { label: 'Deny spike', icon: AlertTriangle, tone: 'text-aegis-coral' },
  depth_spike: { label: 'Chain-depth spike', icon: GitBranch, tone: 'text-aegis-amber' },
  resource_widened: { label: 'Resource widened', icon: FileSearch, tone: 'text-aegis-amber' },
};

export function AnomalyBadges({
  swarmId,
  showAgent = false,
}: {
  swarmId?: string;
  showAgent?: boolean;
}) {
  const q = trpc.observability.anomalies.useQuery(
    swarmId ? { swarmId, windowDays: 7 } : { windowDays: 7 },
    { refetchInterval: POLL_MS },
  );
  const anomalies = q.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Anomalies (7d)</CardTitle>
        <CardDescription>
          {anomalies.length === 0
            ? 'Nothing unusual.'
            : `${anomalies.length} drift signal${anomalies.length === 1 ? '' : 's'} since baseline.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {anomalies.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No new commands, deny spikes, depth spikes, or widened resource sets.
          </p>
        ) : (
          <ul className="space-y-2">
            {anomalies.map((a, i) => {
              const meta = KIND_META[a.kind as AnomalyKind];
              const Icon = meta.icon;
              return (
                <li
                  key={`${a.agentId}:${a.kind}:${i}`}
                  className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Icon className={`h-4 w-4 ${meta.tone}`} />
                    <Badge variant="outline" className="uppercase">
                      {meta.label}
                    </Badge>
                    {showAgent ? (
                      <span className="truncate font-mono text-xs">{a.agentName}</span>
                    ) : null}
                  </div>
                  <code className="truncate text-xs text-muted-foreground">
                    {formatEvidence(a.kind as AnomalyKind, a.evidence)}
                  </code>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function formatEvidence(kind: AnomalyKind, ev: Record<string, unknown>): string {
  if (kind === 'new_command') return `${ev.command as string}`;
  if (kind === 'deny_spike') {
    const rate = ((ev.todayDenyRate as number) * 100).toFixed(0);
    return `${rate}% deny · ${ev.todayDeny}/${ev.todayTotal} today`;
  }
  if (kind === 'depth_spike') {
    return `depth ${ev.todayMaxDepth} > prior ${ev.baselineMaxDepth}`;
  }
  if (kind === 'resource_widened') {
    const avg = ev.baselineAvg as number;
    return `${ev.todayDistinctResources} resources today · avg ${avg.toFixed(1)}`;
  }
  return '';
}
