'use client';

import { Activity, ArrowRightLeft, CheckCircle2, CircleSlash, ShieldAlert } from 'lucide-react';
import { fmtCount, MetricTile } from '../../../components/metric-tile';
import { trpc } from '../../../lib/trpc';
import { ActionGraph } from '../swarms/[id]/components/ActionGraph';
import { ActionTimeline } from '../swarms/[id]/components/ActionTimeline';
import { AgentInventory } from '../swarms/[id]/components/AgentInventory';
import { AnomalyBadges } from '../swarms/[id]/components/AnomalyBadges';
import { LiveFeed } from '../swarms/[id]/components/LiveFeed';

export default function MonitoringPage() {
  const summary = trpc.observability.globalSummary.useQuery(
    { windowDays: 7 },
    { refetchInterval: 15_000 },
  );
  const handoffs = trpc.observability.handoffSummary.useQuery(
    { windowHours: 24 },
    { refetchInterval: 15_000 },
  );
  const s = summary.data;
  const h = handoffs.data;

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
        <MetricTile
          icon={ArrowRightLeft}
          label="Handoffs (24h)"
          value={fmtCount(h?.total)}
          unit={
            h && h.total > 0
              ? `${h.distinctTargets} target agent${h.distinctTargets === 1 ? '' : 's'}`
              : 'no handoffs declared'
          }
          accent="iris"
        />
      </section>

      <ActionGraph />

      <AnomalyBadges showAgent />

      <ActionTimeline />

      <LiveFeed limit={50} />

      <AgentInventory />
    </div>
  );
}
