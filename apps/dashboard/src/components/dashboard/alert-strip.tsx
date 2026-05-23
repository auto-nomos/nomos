'use client';

import { ArrowUpRight, Clock, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { trpc } from '../../lib/trpc';

export function AlertStrip({ windowDays }: { windowDays: number }) {
  const anomalies = trpc.observability.anomalies.useQuery(
    { windowDays },
    { refetchInterval: 30_000 },
  );
  const pending = trpc.stepup.listPending.useQuery(undefined, { refetchInterval: 5_000 });

  const anomalyCount = anomalies.data?.length ?? 0;
  const pendingCount = pending.data?.length ?? 0;
  if (anomalyCount === 0 && pendingCount === 0) return null;

  return (
    <section
      aria-label="Alerts"
      className="flex flex-wrap items-center justify-between gap-4 rounded-sm border border-aegis-amber/40 bg-aegis-amber/[0.04] px-5 py-3"
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {pendingCount > 0 ? (
          <span className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.14em] text-aegis-amber">
            <Clock className="h-3.5 w-3.5" />
            {pendingCount} pending approval{pendingCount === 1 ? '' : 's'}
          </span>
        ) : null}
        {anomalyCount > 0 ? (
          <span className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.14em] text-aegis-coral">
            <ShieldAlert className="h-3.5 w-3.5" />
            {anomalyCount} anomal{anomalyCount === 1 ? 'y' : 'ies'}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {pendingCount > 0 ? (
          <Link
            href="/app/approvals"
            className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-aegis-paper transition-colors hover:text-aegis-signal"
          >
            Review approvals
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        ) : null}
        {anomalyCount > 0 ? (
          <Link
            href="/app/monitoring"
            className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-aegis-paper transition-colors hover:text-aegis-coral"
          >
            See anomalies
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        ) : null}
      </div>
    </section>
  );
}
