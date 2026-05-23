'use client';

import { Activity, Bot, Clock, ShieldCheck } from 'lucide-react';
import { trpc } from '../../lib/trpc';
import { cn } from '../../lib/utils';

function fmt(n: number | null | undefined): string {
  if (n === undefined || n === null) return '—';
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

interface KpiProps {
  label: string;
  value: string;
  unit: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: 'paper' | 'signal' | 'amber' | 'iris';
}

const TONE: Record<KpiProps['tone'], string> = {
  paper: 'text-aegis-paper',
  signal: 'text-aegis-signal',
  amber: 'text-aegis-amber',
  iris: 'text-aegis-iris',
};

function Kpi({ label, value, unit, icon: Icon, tone }: KpiProps) {
  return (
    <div className="col-span-12 flex flex-col justify-between bg-aegis-surface p-6 sm:col-span-6 lg:col-span-3">
      <div className="flex items-center justify-between">
        <span className="eyebrow">{label}</span>
        <Icon className="h-4 w-4 text-aegis-faint" />
      </div>
      <div className="mt-7">
        <div className={cn('font-display text-[44px] leading-none tabular-nums', TONE[tone])}>
          {value}
        </div>
        <div className="mt-2 font-mono text-[11px] uppercase tracking-wider text-aegis-mute">
          {unit}
        </div>
      </div>
    </div>
  );
}

export function KpiRow({ windowDays }: { windowDays: number }) {
  const summary = trpc.observability.globalSummary.useQuery({ windowDays });
  const pending = trpc.stepup.listPending.useQuery(undefined, { refetchInterval: 5_000 });

  const total = summary.data?.total ?? null;
  const allow = summary.data?.allow ?? 0;
  const allowRate = total && total > 0 ? Math.round((allow / total) * 100) : null;

  return (
    <section
      data-stagger
      className="grid grid-cols-12 gap-px overflow-hidden rounded-sm border border-aegis-line bg-aegis-line"
    >
      <Kpi
        icon={Activity}
        label="Decisions"
        value={fmt(total)}
        unit={`last ${windowDays}d`}
        tone="paper"
      />
      <Kpi
        icon={ShieldCheck}
        label="Allow rate"
        value={allowRate === null ? '—' : `${allowRate}%`}
        unit={`${allow}/${total ?? 0}`}
        tone="signal"
      />
      <Kpi
        icon={Bot}
        label="Active apps"
        value={fmt(summary.data?.distinctAgents)}
        unit="distinct agents"
        tone="iris"
      />
      <Kpi
        icon={Clock}
        label="Pending"
        value={fmt(pending.data?.length)}
        unit="approvals"
        tone="amber"
      />
    </section>
  );
}
