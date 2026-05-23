'use client';

import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { trpc } from '../../lib/trpc';
import { ChartCard, ChartEmpty, ChartSkeleton } from './chart-card';

const COLORS = {
  allow: 'hsl(var(--aegis-signal))',
  deny: 'hsl(var(--aegis-coral))',
  stepup: 'hsl(var(--aegis-amber))',
} as const;

function shorten(name: string): string {
  return name.length > 18 ? `${name.slice(0, 17)}…` : name;
}

export function TopAgentsChart({ windowDays }: { windowDays: number }) {
  const inventory = trpc.observability.agentInventory.useQuery({ windowDays });

  const rows = useMemo(() => {
    const all = inventory.data ?? [];
    const filtered = all.filter((a) => a.total > 0);
    return filtered.slice(0, 8).map((a) => ({
      agentId: a.agentId,
      name: shorten(a.agentName),
      allow: a.allow,
      deny: a.deny,
      stepup: a.stepup,
      total: a.total,
    }));
  }, [inventory.data]);

  return (
    <ChartCard
      title="Top apps by activity"
      subtitle={`last ${windowDays} days`}
      href="/app/agents"
      cta="all apps"
    >
      {inventory.isPending ? (
        <ChartSkeleton />
      ) : rows.length === 0 ? (
        <ChartEmpty>No apps have made calls yet.</ChartEmpty>
      ) : (
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 4, right: 16, bottom: 0, left: 8 }}
              barCategoryGap={6}
            >
              <CartesianGrid stroke="hsl(var(--aegis-line))" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: 'hsl(var(--aegis-mute))', fontSize: 11 }}
                axisLine={{ stroke: 'hsl(var(--aegis-line))' }}
                tickLine={false}
                allowDecimals={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: 'hsl(var(--aegis-mute))', fontSize: 11 }}
                axisLine={{ stroke: 'hsl(var(--aegis-line))' }}
                tickLine={false}
                width={120}
              />
              <Tooltip
                cursor={{ fill: 'hsl(var(--aegis-surface-2) / 0.6)' }}
                contentStyle={{
                  background: 'hsl(var(--aegis-surface-2))',
                  border: '1px solid hsl(var(--aegis-line))',
                  borderRadius: 2,
                  fontSize: 12,
                }}
                labelStyle={{ color: 'hsl(var(--aegis-paper))' }}
              />
              <Bar dataKey="allow" stackId="x" fill={COLORS.allow}>
                {rows.map((r) => (
                  <Cell key={`a-${r.agentId}`} cursor="pointer" />
                ))}
              </Bar>
              <Bar dataKey="stepup" stackId="x" fill={COLORS.stepup} />
              <Bar dataKey="deny" stackId="x" fill={COLORS.deny} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}
