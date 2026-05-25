'use client';

import type { HandoffMatch, HandoffMatchStatus } from '@auto-nomos/shared-types';
import { AlertTriangle, Clock, GitBranch } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../../../components/ui/card';
import { trpc } from '../../../../../lib/trpc';
import { shortId } from '../../../../../lib/utils';

/**
 * P3 — workspace-wide "Mis-handoffs" panel.
 *
 * Reuses the same `observability.actionGraph` query that ActionGraph polls,
 * so cache-shared and free. Filters down to handoffMatches whose status is
 * NOT `matched`. Read-only — clicking through goes to the swarm detail.
 */
export function MishandoffPanel({ swarmId, agentId }: { swarmId?: string; agentId?: string } = {}) {
  const q = trpc.observability.actionGraph.useQuery(
    {
      sinceMinutes: 24 * 60,
      ...(swarmId ? { swarmId } : {}),
      ...(agentId ? { agentId } : {}),
    },
    { refetchInterval: 30_000 },
  );

  const bad = (q.data?.handoffMatches ?? []).filter((m) => m.status !== 'matched');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Mis-handoffs (24h)</CardTitle>
        <CardDescription>
          Declared delegations whose child agent never showed up, arrived late, or had the wrong
          DID. P3 diff vs the typed handoff envelope on the parent span.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {bad.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No mis-handoffs in the last 24 hours. All declared delegations matched the actual child
            agent within the 5-minute window.
          </p>
        ) : (
          <ul className="space-y-2">
            {bad.slice(0, 30).map((m) => (
              <li
                key={`${m.sourceSpanId}-${m.status}`}
                className="flex items-start gap-3 rounded-md border bg-muted/20 p-2.5 text-xs"
              >
                <StatusIcon status={m.status} />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={m.status} />
                    <span className="font-mono text-[11px] text-muted-foreground">
                      span {shortId(m.sourceSpanId)}
                    </span>
                  </div>
                  <div className="font-mono text-[11px]">
                    <span className="text-muted-foreground">expected </span>
                    <span>{shortId(m.declaredToDid)}</span>
                    {m.actualAgentDid ? (
                      <>
                        <span className="text-muted-foreground"> · got </span>
                        <span>{shortId(m.actualAgentDid)}</span>
                      </>
                    ) : null}
                    {m.latencyMs !== null ? (
                      <>
                        <span className="text-muted-foreground"> · </span>
                        <span>{Math.round(m.latencyMs / 1000)}s after parent</span>
                      </>
                    ) : null}
                  </div>
                  {m.declaredTask ? (
                    <p className="truncate text-muted-foreground" title={m.declaredTask}>
                      task: {m.declaredTask}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
            {bad.length > 30 ? (
              <li className="text-center text-[11px] text-muted-foreground">
                +{bad.length - 30} more — open a swarm to drill in.
              </li>
            ) : null}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function StatusIcon({ status }: { status: HandoffMatchStatus }) {
  if (status === 'late')
    return <Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-aegis-amber" aria-hidden />;
  if (status === 'wrong_agent')
    return <GitBranch className="mt-0.5 h-4 w-4 flex-shrink-0 text-aegis-coral" aria-hidden />;
  return <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-aegis-coral" aria-hidden />;
}

function StatusBadge({ status }: { status: HandoffMatchStatus }) {
  const tone: Record<HandoffMatchStatus, string> = {
    matched: 'border-aegis-signal/50 bg-aegis-signal/10 text-aegis-signal',
    wrong_agent: 'border-aegis-coral/50 bg-aegis-coral/10 text-aegis-coral',
    missing: 'border-aegis-coral/50 bg-aegis-coral/10 text-aegis-coral',
    late: 'border-aegis-amber/50 bg-aegis-amber/10 text-aegis-amber',
  };
  return (
    <span
      className={`rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${tone[status]}`}
    >
      {status.replace('_', ' ')}
    </span>
  );
}

export type { HandoffMatch };
