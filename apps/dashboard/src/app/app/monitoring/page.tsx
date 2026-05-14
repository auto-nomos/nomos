'use client';

import { Activity, CheckCircle2, CircleSlash, ShieldAlert } from 'lucide-react';
import { fmtCount, MetricTile } from '../../../components/metric-tile';
import { trpc } from '../../../lib/trpc';
import { AgentInventory } from '../swarms/[id]/components/AgentInventory';
import { AnomalyBadges } from '../swarms/[id]/components/AnomalyBadges';
import { LiveFeed } from '../swarms/[id]/components/LiveFeed';

export default function MonitoringPage() {
  const summary = trpc.observability.globalSummary.useQuery(
    { windowDays: 7 },
    { refetchInterval: 15_000 },
  );
  const s = summary.data;

  return (
    <div className="mx-auto max-w-[1180px] space-y-8">
      <header>
        <div className="eyebrow mb-3">observability · workspace-wide</div>
        <h1 className="display text-[48px] leading-tight">
          Do you know what your agents are doing?
        </h1>
        <p className="mt-3 max-w-[560px] text-sm text-aegis-mute">
          Decisions, drift, blast radius — across every app, every swarm, every connection. Polled
          live from the audit chain; no extra instrumentation.
        </p>
      </header>

      <section className="grid grid-cols-12 gap-px overflow-hidden rounded-sm border border-aegis-line bg-aegis-line">
        <MetricTile
          icon={Activity}
          label="Decisions (7d)"
          value={fmtCount(s?.total)}
          unit={`${s?.distinctAgents ?? 0} agents · ${s?.distinctSwarms ?? 0} swarms`}
          accent="paper"
        />
        <MetricTile
          icon={CheckCircle2}
          label="Allow"
          value={fmtCount(s?.allow)}
          unit={
            s && s.total > 0
              ? `${Math.round((s.allow / s.total) * 100)}% of total`
              : 'no traffic yet'
          }
          accent="signal"
        />
        <MetricTile
          icon={ShieldAlert}
          label="Step-up"
          value={fmtCount(s?.stepup)}
          unit="human in the loop"
          accent="iris"
        />
        <MetricTile
          icon={CircleSlash}
          label="Deny"
          value={fmtCount(s?.deny)}
          unit={
            s && s.total > 0
              ? `${Math.round((s.deny / s.total) * 100)}% of total`
              : 'no traffic yet'
          }
          accent="coral"
        />
      </section>

      <AnomalyBadges showAgent />

      <LiveFeed limit={50} />

      <AgentInventory />
    </div>
  );
}
