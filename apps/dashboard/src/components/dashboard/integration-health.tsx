'use client';

import { ArrowUpRight, Plug } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { trpc } from '../../lib/trpc';
import { cn } from '../../lib/utils';
import { ChartCard, ChartEmpty, ChartSkeleton } from './chart-card';

interface ConnSummary {
  connector: string;
  count: number;
  stale: number;
  expiring: number;
}

function summarize(
  rows: { connector: string; accessTokenExpiresAt: Date | string | null }[],
): ConnSummary[] {
  const map = new Map<string, ConnSummary>();
  const now = Date.now();
  const HOUR = 60 * 60 * 1000;
  for (const r of rows) {
    const c = map.get(r.connector) ?? { connector: r.connector, count: 0, stale: 0, expiring: 0 };
    c.count += 1;
    const exp = r.accessTokenExpiresAt ? new Date(r.accessTokenExpiresAt).getTime() : null;
    if (exp !== null) {
      if (exp < now) c.stale += 1;
      else if (exp - now < HOUR) c.expiring += 1;
    }
    map.set(r.connector, c);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export function IntegrationHealth() {
  const conns = trpc.oauth.list.useQuery();
  const summary = useMemo(() => summarize(conns.data ?? []), [conns.data]);

  return (
    <ChartCard
      title="Integration health"
      subtitle="OAuth connections"
      href="/app/connections"
      cta="manage"
    >
      {conns.isPending ? (
        <ChartSkeleton />
      ) : summary.length === 0 ? (
        <ChartEmpty>
          <span>
            No SaaS connected yet.{' '}
            <Link href="/app/connections" className="text-aegis-signal hover:underline">
              Bind one →
            </Link>
          </span>
        </ChartEmpty>
      ) : (
        <ul className="grid h-[260px] grid-cols-2 gap-px overflow-y-auto bg-aegis-line">
          {summary.map((c) => {
            const health = c.stale > 0 ? 'stale' : c.expiring > 0 ? 'expiring' : 'ok';
            const tone =
              health === 'stale'
                ? 'border-aegis-coral/40 text-aegis-coral'
                : health === 'expiring'
                  ? 'border-aegis-amber/40 text-aegis-amber'
                  : 'border-aegis-signal/30 text-aegis-signal';
            return (
              <li key={c.connector} className="bg-aegis-surface px-4 py-4">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 text-sm font-medium text-aegis-paper">
                    <Plug className="h-3.5 w-3.5 text-aegis-faint" />
                    {c.connector}
                  </span>
                  <span
                    className={cn(
                      'inline-flex h-5 items-center rounded-sm border px-1.5 font-mono text-[10px] uppercase tracking-wider',
                      tone,
                    )}
                  >
                    {health}
                  </span>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="font-display text-2xl text-aegis-paper tabular-nums">
                    {c.count}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-aegis-mute">
                    {c.count === 1 ? 'connection' : 'connections'}
                  </span>
                </div>
                {c.stale > 0 || c.expiring > 0 ? (
                  <div className="mt-1 font-mono text-[10px] text-aegis-faint">
                    {c.stale > 0 ? `${c.stale} stale` : null}
                    {c.stale > 0 && c.expiring > 0 ? ' · ' : null}
                    {c.expiring > 0 ? `${c.expiring} expiring` : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {summary.length > 0 ? (
        <div className="mt-1 px-4 pb-2">
          <Link
            href="/app/connections"
            className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-mute transition-colors hover:text-aegis-paper"
          >
            connect another
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      ) : null}
    </ChartCard>
  );
}
