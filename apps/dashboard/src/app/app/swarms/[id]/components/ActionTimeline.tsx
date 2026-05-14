'use client';

import { Badge } from '../../../../../components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../../../components/ui/card';
import { trpc } from '../../../../../lib/trpc';
import { formatDate, shortId } from '../../../../../lib/utils';

const POLL_MS = 5_000;

export function ActionTimeline({ swarmId }: { swarmId?: string }) {
  const q = trpc.observability.actionTimeline.useQuery(
    swarmId ? { swarmId, limit: 50 } : { limit: 50 },
    { refetchInterval: POLL_MS },
  );

  const rows = q.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Action timeline</CardTitle>
        <CardDescription>
          {rows.length === 0
            ? 'No spans recorded yet.'
            : `Last ${rows.length} tool invocations across this scope.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            The first span shows up here within ~5s of an MCP tool call.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li
                key={r.id}
                className="grid grid-cols-[90px_minmax(0,1fr)_120px_120px_80px] items-center gap-3 py-2 text-sm"
              >
                <Badge
                  variant={
                    r.status === 'success'
                      ? 'default'
                      : r.status === 'denied'
                        ? 'secondary'
                        : 'destructive'
                  }
                  className="justify-self-start uppercase"
                >
                  {r.status}
                </Badge>
                <code className="truncate text-xs">{r.toolName}</code>
                <span className="font-mono text-xs text-muted-foreground">
                  {shortId(r.agentId)}
                </span>
                <span className="text-right font-mono text-xs text-muted-foreground">
                  {formatDate(r.startedAt)}
                </span>
                <span className="text-right font-mono text-xs text-muted-foreground">
                  {r.latencyMs}ms
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
