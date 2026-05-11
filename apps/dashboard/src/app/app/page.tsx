'use client';

import {
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  CircleSlash,
  FileLock2,
  Plug,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { trpc } from '../../lib/trpc';
import { cn } from '../../lib/utils';

export default function AppHomePage() {
  const customer = trpc.customers.get.useQuery();
  const agents = trpc.agents.list.useQuery();
  const policies = trpc.policies.list.useQuery();
  const audit = trpc.audit.list.useQuery({ limit: 8 });
  const connections = trpc.oauth.list.useQuery();

  const allows = (audit.data ?? []).filter((r) => r.decision === 'allow').length;
  const denies = (audit.data ?? []).filter((r) => r.decision === 'deny').length;
  const stepups = (audit.data ?? []).filter((r) => r.decision === 'stepup').length;
  const total = audit.data?.length ?? 0;
  const allowRate = total > 0 ? Math.round((allows / total) * 100) : null;

  return (
    <div className="mx-auto max-w-[1180px] space-y-12">
      <Hero workspaceName={customer.data?.name ?? 'Workspace'} />

      <section
        data-stagger
        className="grid grid-cols-12 gap-px overflow-hidden rounded-sm border border-aegis-line bg-aegis-line"
      >
        <Metric
          icon={Boxes}
          label="Apps"
          value={fmt(agents.data?.length)}
          unit="registered"
          href="/app/agents"
          accent="paper"
        />
        <Metric
          icon={Plug}
          label="Connections"
          value={fmt(connections.data?.length)}
          unit="OAuth bound"
          href="/app/connections"
          accent="iris"
        />
        <Metric
          icon={FileLock2}
          label="Policies"
          value={fmt(policies.data?.length)}
          unit="cedar rules"
          href="/app/policies"
          accent="paper"
        />
        <Metric
          icon={ShieldCheck}
          label="Allow rate"
          value={allowRate === null ? '—' : `${allowRate}%`}
          unit={`${allows}/${total} last`}
          href="/app/audit"
          accent="signal"
        />
      </section>

      <section className="grid grid-cols-12 gap-6">
        <RecentDecisions
          rows={audit.data ?? []}
          loading={audit.isPending}
          allows={allows}
          denies={denies}
          stepups={stepups}
        />
        <QuickStart />
      </section>

      <Glossary />
    </div>
  );
}

/* ─── Hero ────────────────────────────────────────────────────────────── */

function Hero({ workspaceName }: { workspaceName: string }) {
  return (
    <header className="relative">
      <div className="eyebrow mb-5">workspace · {workspaceName.toLowerCase()}</div>
      <h1 className="display max-w-[820px] text-[64px] text-aegis-paper md:text-[80px]">
        Authorize what your <em>agents</em> do — without giving them the keys.
      </h1>
      <p className="mt-6 max-w-[640px] text-base text-aegis-mute">
        Nomos sits between your AI agents and every SaaS API you connect. Agents declare intent, you
        set the policy, the gateway proxies the call. Credentials never leave the broker.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link
          href="/app/guide"
          className="group inline-flex items-center gap-2 rounded-sm bg-aegis-signal px-4 py-2.5 font-mono text-xs uppercase tracking-[0.16em] text-aegis-ink transition-transform hover:-translate-y-px"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Open user guide
          <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link
          href="/onboarding"
          className="inline-flex items-center gap-2 rounded-sm border border-aegis-line bg-aegis-surface-2 px-4 py-2.5 font-mono text-xs uppercase tracking-[0.16em] text-aegis-paper transition-colors hover:border-aegis-line-strong"
        >
          5-min onboarding
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
        <span className="ml-1 font-mono text-[11px] uppercase tracking-wider text-aegis-faint">
          v0.1.x · prerelease
        </span>
      </div>
    </header>
  );
}

/* ─── Metric tiles ────────────────────────────────────────────────────── */

function Metric({
  icon: Icon,
  label,
  value,
  unit,
  href,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  unit: string;
  href: string;
  accent: 'paper' | 'signal' | 'iris' | 'coral';
}) {
  const accentClass = {
    paper: 'text-aegis-paper',
    signal: 'text-aegis-signal',
    iris: 'text-aegis-iris',
    coral: 'text-aegis-coral',
  }[accent];
  return (
    <Link
      href={href}
      className="col-span-12 flex flex-col justify-between bg-aegis-surface p-6 transition-colors hover:bg-aegis-surface-2 sm:col-span-6 lg:col-span-3"
    >
      <div className="flex items-center justify-between">
        <span className="eyebrow">{label}</span>
        <Icon className="h-4 w-4 text-aegis-faint" />
      </div>
      <div className="mt-7">
        <div className={cn('font-display text-[48px] leading-none', accentClass)}>{value}</div>
        <div className="mt-2 font-mono text-[11px] uppercase tracking-wider text-aegis-mute">
          {unit}
        </div>
      </div>
    </Link>
  );
}

function fmt(n: number | undefined): string {
  if (n === undefined || n === null) return '—';
  return n.toString().padStart(2, '0');
}

/* ─── Recent decisions strip ──────────────────────────────────────────── */

interface AuditRow {
  eventId: string;
  decision: string;
  command?: string | null;
  ts?: Date | string;
  payload?: unknown;
}

function RecentDecisions({
  rows,
  loading,
  allows,
  denies,
  stepups,
}: {
  rows: AuditRow[];
  loading: boolean;
  allows: number;
  denies: number;
  stepups: number;
}) {
  return (
    <article className="col-span-12 overflow-hidden rounded-sm border border-aegis-line bg-aegis-surface lg:col-span-8">
      <div className="flex items-center justify-between border-b border-aegis-line px-6 py-4">
        <div>
          <div className="eyebrow">live · last 8 decisions</div>
          <h2 className="mt-1 font-display text-2xl text-aegis-paper">Audit chain</h2>
        </div>
        <div className="tickrow font-mono text-[11px] uppercase tracking-wider">
          <Tally icon={CheckCircle2} label="allow" value={allows} tone="text-aegis-signal" />
          <Tally icon={ShieldAlert} label="step-up" value={stepups} tone="text-aegis-amber" />
          <Tally icon={CircleSlash} label="deny" value={denies} tone="text-aegis-coral" />
        </div>
      </div>

      <ul className="divide-y divide-aegis-line">
        {loading ? (
          <li className="px-6 py-10 text-center font-mono text-xs uppercase tracking-wider text-aegis-mute">
            <span className="pulse mr-2" />
            streaming…
          </li>
        ) : rows.length === 0 ? (
          <li className="px-6 py-10 text-center text-sm text-aegis-mute">
            No decisions yet. Once your first App makes a call, it lands here.
          </li>
        ) : (
          rows.map((r) => <DecisionRow key={r.eventId} row={r} />)
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

function Tally({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-1.5 px-1.5">
      <Icon className={cn('h-3.5 w-3.5', tone)} />
      <span className="text-aegis-mute">{label}</span>
      <span className={cn('tabular-nums', tone)}>{value.toString().padStart(2, '0')}</span>
    </div>
  );
}

function DecisionRow({ row }: { row: AuditRow }) {
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

/* ─── Quick start (right column) ──────────────────────────────────────── */

const QUICK_STEPS = [
  {
    n: '01',
    t: 'Connect a SaaS',
    body: 'Bind GitHub, Slack, Linear, Stripe — credentials stay encrypted in the broker.',
  },
  {
    n: '02',
    t: 'Register an App',
    body: 'Issue an API key for your agent. The key never sees a token; it asks Nomos to mint UCANs.',
  },
  {
    n: '03',
    t: 'Write a policy',
    body: 'Pick a starter template or draft Cedar in the visual builder. The PDP enforces it on every call.',
  },
  {
    n: '04',
    t: 'Run the agent',
    body: 'Watch decisions land in the audit chain. Approve step-ups via passkey when something risky shows up.',
  },
];

function QuickStart() {
  return (
    <article className="col-span-12 overflow-hidden rounded-sm border border-aegis-line bg-aegis-surface lg:col-span-4">
      <div className="border-b border-aegis-line px-6 py-4">
        <div className="eyebrow">orientation</div>
        <h2 className="mt-1 font-display text-2xl text-aegis-paper">5-minute path</h2>
      </div>
      <ol className="space-y-5 px-6 py-5">
        {QUICK_STEPS.map((step) => (
          <li key={step.n} className="grid grid-cols-[40px_minmax(0,1fr)] gap-3">
            <div className="font-display text-2xl leading-none text-aegis-signal">{step.n}</div>
            <div>
              <div className="text-sm font-medium text-aegis-paper">{step.t}</div>
              <div className="mt-1 text-xs leading-relaxed text-aegis-mute">{step.body}</div>
            </div>
          </li>
        ))}
      </ol>
      <div className="border-t border-aegis-line px-6 py-3">
        <Link
          href="/app/guide"
          className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-mute transition-colors hover:text-aegis-paper"
        >
          read full guide
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
    </article>
  );
}

/* ─── Glossary band ───────────────────────────────────────────────────── */

const GLOSSARY = [
  {
    term: 'UCAN',
    body: 'Cryptographic delegation token. Nomos mints one per request — never gives the agent a long-lived key.',
  },
  {
    term: 'Envelope',
    body: 'A passkey-cosigned grant that bounds resource + actions for a session. Standing variant lasts until revoked.',
  },
  {
    term: 'Step-up',
    body: 'When the policy or risk classifier denies, the human approves with a passkey before the call proceeds.',
  },
  {
    term: 'Audit chain',
    body: 'Every decision is hashed into an append-only Merkle chain. Daily roots are signed Ed25519.',
  },
];

function Glossary() {
  return (
    <section className="rounded-sm border border-aegis-line bg-aegis-surface px-8 py-7">
      <div className="grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-2 lg:grid-cols-4">
        {GLOSSARY.map((g) => (
          <div key={g.term}>
            <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-signal">
              {g.term}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-aegis-mute">{g.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
