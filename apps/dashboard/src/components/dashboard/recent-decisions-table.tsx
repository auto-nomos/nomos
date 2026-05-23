'use client';

import { ArrowUpRight, CheckCircle2, CircleSlash, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { trpc } from '../../lib/trpc';
import { cn } from '../../lib/utils';
import { TallyBadge } from '../tally-badge';

interface AuditRow {
  eventId: string;
  decision: string;
  command?: string | null;
  ts?: Date | string;
  payload?: unknown;
}

function readReason(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  const decision = p.decision as Record<string, unknown> | undefined;
  if (decision && typeof decision === 'object' && typeof decision.reason === 'string') {
    return decision.reason;
  }
  if (typeof p.reason === 'string') return p.reason;
  return null;
}

export function RecentDecisionsTable() {
  const audit = trpc.audit.list.useQuery({ limit: 8 });
  const rows: AuditRow[] = (audit.data ?? []) as AuditRow[];
  const allows = rows.filter((r) => r.decision === 'allow').length;
  const denies = rows.filter((r) => r.decision === 'deny').length;
  const stepups = rows.filter((r) => r.decision === 'stepup').length;

  return (
    <article className="col-span-12 overflow-hidden rounded-sm border border-aegis-line bg-aegis-surface">
      <div className="flex items-center justify-between border-b border-aegis-line px-6 py-4">
        <div>
          <div className="eyebrow">live · last 8 decisions</div>
          <h2 className="mt-1 font-display text-xl text-aegis-paper">Recent activity</h2>
        </div>
        <div className="tickrow font-mono text-[11px] uppercase tracking-wider">
          <TallyBadge icon={CheckCircle2} label="allow" value={allows} tone="text-aegis-signal" />
          <TallyBadge icon={ShieldAlert} label="step-up" value={stepups} tone="text-aegis-amber" />
          <TallyBadge icon={CircleSlash} label="deny" value={denies} tone="text-aegis-coral" />
        </div>
      </div>

      <ul className="divide-y divide-aegis-line">
        {audit.isPending ? (
          <li className="px-6 py-10 text-center font-mono text-xs uppercase tracking-wider text-aegis-mute">
            <span className="pulse mr-2" />
            streaming…
          </li>
        ) : rows.length === 0 ? (
          <li className="px-6 py-10 text-center text-sm text-aegis-mute">
            No decisions yet. Once your first App makes a call, it lands here.
          </li>
        ) : (
          rows.map((r) => <Row key={r.eventId} row={r} />)
        )}
      </ul>

      <div className="border-t border-aegis-line px-6 py-3">
        <Link
          href="/app/audit"
          className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-mute transition-colors hover:text-aegis-paper"
        >
          full chain · proof download
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
    </article>
  );
}

function Row({ row }: { row: AuditRow }) {
  const tone =
    row.decision === 'allow'
      ? 'text-aegis-signal'
      : row.decision === 'deny'
        ? 'text-aegis-coral'
        : 'text-aegis-amber';
  const reason = readReason(row.payload);
  return (
    <li className="grid grid-cols-[100px_minmax(0,1fr)_140px] items-center gap-4 px-6 py-3.5">
      <span className={cn('font-mono text-xs uppercase tracking-[0.16em]', tone)}>
        {row.decision}
      </span>
      <div className="min-w-0">
        <div className="truncate font-mono text-sm text-aegis-paper">{row.command ?? '—'}</div>
        {reason ? <div className="mt-0.5 truncate text-xs text-aegis-mute">{reason}</div> : null}
      </div>
      <span className="text-right font-mono text-[11px] text-aegis-faint">
        {row.ts ? new Date(row.ts).toLocaleTimeString() : '—'}
      </span>
    </li>
  );
}
