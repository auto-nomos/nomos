'use client';

import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
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
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
              <defs>
                <linearGradient id="allow-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.allow} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={COLORS.allow} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="deny-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.deny} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={COLORS.deny} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="stepup-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.stepup} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={COLORS.stepup} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="hsl(var(--aegis-line))" vertical={false} />
              <XAxis
                dataKey="day"
                tickFormatter={fmtDay}
                tick={{ fill: 'hsl(var(--aegis-mute))', fontSize: 11 }}
                axisLine={{ stroke: 'hsl(var(--aegis-line))' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'hsl(var(--aegis-mute))', fontSize: 11 }}
                axisLine={{ stroke: 'hsl(var(--aegis-line))' }}
                tickLine={false}
                width={32}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--aegis-surface-2))',
                  border: '1px solid hsl(var(--aegis-line))',
                  borderRadius: 2,
                  fontSize: 12,
                }}
                labelStyle={{ color: 'hsl(var(--aegis-paper))' }}
                labelFormatter={(label) => (typeof label === 'string' ? fmtDay(label) : label)}
              />
              <Area
                type="monotone"
                dataKey="allow"
                stackId="d"
                stroke={COLORS.allow}
                strokeWidth={1.5}
                fill="url(#allow-grad)"
              />
              <Area
                type="monotone"
                dataKey="stepup"
                stackId="d"
                stroke={COLORS.stepup}
                strokeWidth={1.5}
                fill="url(#stepup-grad)"
              />
              <Area
                type="monotone"
                dataKey="deny"
                stackId="d"
                stroke={COLORS.deny}
                strokeWidth={1.5}
                fill="url(#deny-grad)"
              />
            </AreaChart>
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
