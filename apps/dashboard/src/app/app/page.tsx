'use client';

import { ArrowUpRight, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { AlertStrip } from '../../components/dashboard/alert-strip';
import { DecisionMixChart } from '../../components/dashboard/decision-mix-chart';
import { DecisionsTrendChart } from '../../components/dashboard/decisions-trend-chart';
import { IntegrationHealth } from '../../components/dashboard/integration-health';
import { KpiRow } from '../../components/dashboard/kpi-row';
import { QuickActions } from '../../components/dashboard/quick-actions';
import { RecentDecisionsTable } from '../../components/dashboard/recent-decisions-table';
import { TopAgentsChart } from '../../components/dashboard/top-agents-chart';
import { useWindowDays, WindowSelect } from '../../components/dashboard/window-select';
import { trpc } from '../../lib/trpc';

export default function AppHomePage() {
  return (
    <Suspense fallback={null}>
      <DashboardInner />
    </Suspense>
  );
}

function DashboardInner() {
  const customer = trpc.customers.get.useQuery();
  const windowDays = useWindowDays();

  return (
    <div className="mx-auto max-w-[1180px] space-y-8">
      <Hero workspaceName={customer.data?.name ?? 'Workspace'} />

      <QuickActions />

      <AlertStrip windowDays={windowDays} />

      <KpiRow windowDays={windowDays} />

      <section className="grid grid-cols-12 gap-6">
        <DecisionsTrendChart windowDays={windowDays} />
        <DecisionMixChart windowDays={windowDays} />
      </section>

      <section className="grid grid-cols-12 gap-6">
        <TopAgentsChart windowDays={windowDays} />
        <IntegrationHealth />
      </section>

      <section className="grid grid-cols-12 gap-6">
        <RecentDecisionsTable />
      </section>
    </div>
  );
}

function Hero({ workspaceName }: { workspaceName: string }) {
  return (
    <header className="relative flex flex-wrap items-end justify-between gap-6">
      <div>
        <div className="eyebrow mb-3">workspace · {workspaceName.toLowerCase()}</div>
        <h1 className="display max-w-[820px] text-[44px] text-aegis-paper md:text-[56px]">
          Dashboard
        </h1>
        <p className="mt-3 max-w-[560px] text-sm text-aegis-mute">
          Decisions, apps, and integration health at a glance. Use the actions below to spin up new
          surface area without leaving home.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <WindowSelect />
        <Link
          href="/app/guide"
          className="group inline-flex items-center gap-2 rounded-sm border border-aegis-line bg-aegis-surface px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-aegis-paper transition-colors hover:border-aegis-signal/40"
        >
          <Sparkles className="h-3.5 w-3.5 text-aegis-signal" />
          Guide
          <ArrowUpRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </header>
  );
}
