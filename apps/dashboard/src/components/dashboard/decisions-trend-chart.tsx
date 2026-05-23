'use client';

import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { trpc } from '../../lib/trpc';
import { ChartCard, ChartEmpty, ChartSkeleton } from './chart-card';

interface Point {
  day: string;
  allow: number;
  deny: number;
  stepup: number;
}

function zeroFill(points: Point[], windowDays: number): Point[] {
  const map = new Map(points.map((p) => [p.day, p]));
  const out: Point[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push(map.get(key) ?? { day: key, allow: 0, deny: 0, stepup: 0 });
  }
  return out;
}

function fmtDay(s: string): string {
  const d = new Date(`${s}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const COLORS = {
  allow: 'hsl(var(--aegis-signal))',
  deny: 'hsl(var(--aegis-coral))',
  stepup: 'hsl(var(--aegis-amber))',
} as const;

export function DecisionsTrendChart({ windowDays }: { windowDays: number }) {
  const trend = trpc.observability.dailyTrend.useQuery({ windowDays });

  const data = useMemo(
    () => zeroFill(trend.data?.points ?? [], windowDays),
    [trend.data, windowDays],
  );
  const total = data.reduce((acc, p) => acc + p.allow + p.deny + p.stepup, 0);
  const xInterval = windowDays > 14 ? Math.floor(windowDays / 7) : 0;

  return (
    <ChartCard
      title="Decisions over time"
      subtitle={`last ${windowDays} days`}
      href="/app/audit"
      cta="full audit"
    >
      {trend.isPending ? (
        <ChartSkeleton />
      ) : total === 0 ? (
        <ChartEmpty>No decisions in this window yet.</ChartEmpty>
      ) : (
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 8, right: 12, bottom: 4, left: -8 }}
              barCategoryGap={windowDays > 14 ? 2 : 6}
            >
              <CartesianGrid
                stroke="hsl(var(--aegis-line-strong))"
                strokeDasharray="2 3"
                vertical={false}
              />
              <XAxis
                dataKey="day"
                tickFormatter={fmtDay}
                tick={{ fill: 'hsl(var(--aegis-paper))', fontSize: 11 }}
                axisLine={{ stroke: 'hsl(var(--aegis-line-strong))' }}
                tickLine={false}
                interval={xInterval}
                minTickGap={8}
              />
              <YAxis
                tick={{ fill: 'hsl(var(--aegis-paper))', fontSize: 11 }}
                axisLine={{ stroke: 'hsl(var(--aegis-line-strong))' }}
                tickLine={false}
                width={36}
                allowDecimals={false}
                domain={[0, 'auto']}
              />
              <Tooltip
                cursor={{ fill: 'hsl(var(--aegis-surface-2) / 0.6)' }}
                contentStyle={{
                  background: 'hsl(var(--aegis-surface-2))',
                  border: '1px solid hsl(var(--aegis-line-strong))',
                  borderRadius: 2,
                  fontSize: 12,
                }}
                labelStyle={{ color: 'hsl(var(--aegis-paper))' }}
                labelFormatter={(label) => (typeof label === 'string' ? fmtDay(label) : label)}
              />
              <Bar dataKey="allow" stackId="d" fill={COLORS.allow} radius={[0, 0, 0, 0]} />
              <Bar dataKey="stepup" stackId="d" fill={COLORS.stepup} radius={[0, 0, 0, 0]} />
              <Bar dataKey="deny" stackId="d" fill={COLORS.deny} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <Legend />
    </ChartCard>
  );
}

function Legend() {
  return (
    <ul className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 px-4 pb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-aegis-mute">
      <li className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ background: COLORS.allow }} /> allow
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ background: COLORS.stepup }} /> step-up
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ background: COLORS.deny }} /> deny
      </li>
    </ul>
  );
}
