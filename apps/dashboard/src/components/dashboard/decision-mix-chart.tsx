'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { trpc } from '../../lib/trpc';
import { ChartCard, ChartEmpty, ChartSkeleton } from './chart-card';

const COLORS = {
  allow: 'hsl(var(--aegis-signal))',
  deny: 'hsl(var(--aegis-coral))',
  stepup: 'hsl(var(--aegis-amber))',
} as const;

export function DecisionMixChart({ windowDays }: { windowDays: number }) {
  const summary = trpc.observability.globalSummary.useQuery({ windowDays });
  const total = summary.data?.total ?? 0;

  const slices = [
    { name: 'allow', value: summary.data?.allow ?? 0, color: COLORS.allow },
    { name: 'step-up', value: summary.data?.stepup ?? 0, color: COLORS.stepup },
    { name: 'deny', value: summary.data?.deny ?? 0, color: COLORS.deny },
  ];

  return (
    <ChartCard title="Decision mix" subtitle={`last ${windowDays} days`}>
      {summary.isPending ? (
        <ChartSkeleton />
      ) : total === 0 ? (
        <ChartEmpty>No decisions to break down yet.</ChartEmpty>
      ) : (
        <div className="flex h-[260px] items-center gap-4">
          <div className="h-full flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={56}
                  outerRadius={92}
                  paddingAngle={2}
                  stroke="hsl(var(--aegis-surface))"
                  strokeWidth={2}
                >
                  {slices.map((s) => (
                    <Cell key={s.name} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--aegis-surface-2))',
                    border: '1px solid hsl(var(--aegis-line))',
                    borderRadius: 2,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: 'hsl(var(--aegis-paper))' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="flex w-[140px] flex-col gap-3 pr-2">
            {slices.map((s) => {
              const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
              return (
                <li key={s.name}>
                  <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-aegis-mute">
                    <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                    {s.name}
                  </div>
                  <div className="mt-0.5 flex items-baseline gap-1.5 font-display text-2xl text-aegis-paper">
                    {pct}
                    <span className="font-mono text-xs text-aegis-faint">%</span>
                  </div>
                  <div className="font-mono text-[10px] text-aegis-faint tabular-nums">
                    {s.value} / {total}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </ChartCard>
  );
}
