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

const POLL_MS = 3_000;

export function LiveFeed({ swarmId, limit = 50 }: { swarmId?: string; limit?: number }) {
  const feed = trpc.observability.liveFeed.useQuery(swarmId ? { swarmId, limit } : { limit }, {
    refetchInterval: POLL_MS,
  });

  const rows = feed.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Live activity{' '}
          <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
            polling every {POLL_MS / 1000}s
          </span>
        </CardTitle>
        <CardDescription>
          {rows.length === 0 ? 'No receipts yet.' : `Last ${rows.length} authorize calls.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Waiting for activity…</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li
                key={r.eventId}
                className="grid grid-cols-[80px_minmax(0,1fr)_140px_120px_60px] items-center gap-3 py-2 text-sm"
              >
                <Badge
                  variant={
                    r.decision === 'allow'
                      ? 'default'
                      : r.decision === 'stepup'
                        ? 'secondary'
                        : 'destructive'
                  }
                  className="justify-self-start uppercase"
                >
                  {r.decision}
                </Badge>
                <div className="truncate font-mono text-xs">{r.command}</div>
                <div className="truncate font-mono text-xs text-muted-foreground">
                  {shortId(r.agent)}
                </div>
                <div className="text-right font-mono text-xs text-muted-foreground">
                  {formatDate(r.ts)}
                </div>
                <div className="text-right font-mono text-xs text-muted-foreground">
                  d{r.chainDepth ?? 0}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
