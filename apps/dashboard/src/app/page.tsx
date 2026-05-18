import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Cloud,
  FileLock2,
  GitBranch,
  GitGraph,
  Hash,
  KeyRound,
  Network,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
} from 'lucide-react';
import Link from 'next/link';
import { PublicShell } from '../components/nomos/public-shell';

/* ======================================================================
   Nomos — homepage
   ----------------------------------------------------------------------
   Editorial marketing landing built around three product pillars:
   federated cloud IAM, multi-agent swarms, and live monitoring.
   Twelve vertical bands:
     1. Editorial hero
     2. Live tickrow (capabilities at a glance)
     3. "How it works" — three-act pipeline
     4. Cloud IAM (federated OIDC)
     5. Multi-agent swarms (UCAN delegation)
     6. Live monitoring (audit-chain-driven observability)
     7. Integration marquee
     8. Security pillars
     9. Code preview + decision log
    10. Use-cases grid
    11. Reading list
    12. Bottom CTA banner
   The shape of the page is unusual: each band runs full-bleed but the
   inner rail is 1280px max. We keep large negative space and let the
   chartreuse accent appear only where it carries meaning.
   ====================================================================== */

export default function HomePage() {
  return (
    <PublicShell>
      <Hero />
      <CapabilityTickRow />
      <HowItWorks />
      <CloudIAM />
      <Swarms />
      <Monitoring />
      <IntegrationMarquee />
      <SecurityPillars />
      <CodeAndDecisions />
      <UseCases />
      <ReadingList />
      <BottomCta />
    </PublicShell>
  );
}

/* ─── 1. Hero ───────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-[1280px] grid-cols-12 gap-10 px-6 pt-24 pb-32 md:px-10 md:pt-32">
        <div className="col-span-12 lg:col-span-8" data-stagger>
          <div className="eyebrow flex items-center gap-3">
            <span className="pulse" />
            <span>Nomos · v0.1.x · open beta</span>
          </div>
          <h1 className="display mt-7 max-w-[12ch] text-[64px] text-aegis-paper md:text-[96px] lg:text-[112px]">
            Agents need <em>guardrails</em>.
            <br />
            Not guesswork.
          </h1>
          <p className="mt-9 max-w-[600px] text-lg leading-relaxed text-aegis-mute md:text-xl">
            Scoped permissions, signed actions, replayable audit. Nomos is the control plane between
            your AI agents and the world — every action authorized, every scope narrowed, every
            decision witnessed.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              href="/sign-up"
              className="group inline-flex items-center gap-2 rounded-sm bg-aegis-signal px-5 py-3 font-mono text-[12px] uppercase tracking-[0.18em] text-aegis-ink transition-colors hover:bg-aegis-signal/90"
            >
              Start free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/docs"
              className="group inline-flex items-center gap-2 rounded-sm border border-aegis-line px-5 py-3 font-mono text-[12px] uppercase tracking-[0.18em] text-aegis-paper transition-colors hover:border-aegis-line-strong"
            >
              Read the docs
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
          </div>
          <div className="mt-12 flex flex-wrap items-center gap-x-7 gap-y-3 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-faint">
            <span>Scoped permissions</span>
            <span aria-hidden>·</span>
            <span>UCAN delegation</span>
            <span aria-hidden>·</span>
            <span>Cedar policies</span>
            <span aria-hidden>·</span>
            <span>Live audit</span>
          </div>
        </div>
        <aside className="hidden lg:col-span-4 lg:block">
          <HeroPanel />
        </aside>
      </div>
      <div className="rule" />
    </section>
  );
}

function HeroPanel() {
  const feed: {
    ts: string;
    act: 'allow' | 'step-up' | 'deny';
    det: string;
    tone: 'signal' | 'amber' | 'coral';
  }[] = [
    { ts: '14:22:08', act: 'allow', det: 'release-bot · issue.create', tone: 'signal' },
    { ts: '14:22:08', act: 'step-up', det: 'release-bot · repo.transfer', tone: 'amber' },
    { ts: '14:22:07', act: 'allow', det: 'support-bot · message.send', tone: 'signal' },
    { ts: '14:22:06', act: 'deny', det: 'fin-bot · charge.refund', tone: 'coral' },
    { ts: '14:22:05', act: 'allow', det: 'planner → writer · ucan-mint', tone: 'signal' },
    { ts: '14:22:03', act: 'allow', det: 'support-bot · page.read', tone: 'signal' },
  ];
  return (
    <div className="corners relative h-full min-h-[440px] rounded-sm border border-aegis-line bg-aegis-surface/50 p-7 backdrop-blur">
      <div className="flex items-baseline justify-between">
        <div className="eyebrow">live feed · workspace</div>
        <span className="font-mono text-[10px] text-aegis-faint">↓ tail</span>
      </div>
      <ul className="mt-5 divide-y divide-aegis-line/60 font-mono text-[11px]">
        {feed.map((r) => (
          <li
            key={`${r.ts}-${r.det}`}
            className="grid grid-cols-[68px_60px_1fr] items-center gap-3 py-2.5"
          >
            <span className="text-aegis-faint">{r.ts}</span>
            <span
              className={
                r.tone === 'signal'
                  ? 'text-aegis-signal'
                  : r.tone === 'coral'
                    ? 'text-aegis-coral'
                    : 'text-aegis-amber'
              }
            >
              {r.act}
            </span>
            <span className="truncate text-aegis-paper">{r.det}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6 border-t border-aegis-line pt-5">
        <div className="eyebrow mb-3">7d window</div>
        <dl className="space-y-2.5 font-mono text-[11px] text-aegis-mute">
          <Row label="decisions" value="14,922" tone="paper" />
          <Row label="allow" value="92%" tone="signal" />
          <Row label="step-up" value="6%" />
          <Row label="deny" value="2%" />
        </dl>
      </div>
      <div className="mt-6 flex items-center justify-between border-t border-aegis-line pt-4">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
          chain head
        </span>
        <span className="font-mono text-[10px] text-aegis-paper">09f4 · 1c7b · ae71</span>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  tone = 'mute',
}: {
  label: string;
  value: string;
  tone?: 'mute' | 'paper' | 'signal';
}) {
  const toneClass = {
    mute: 'text-aegis-paper',
    paper: 'text-aegis-paper',
    signal: 'text-aegis-signal',
  }[tone];
  return (
    <div className="flex items-center justify-between border-b border-aegis-line/60 pb-2.5">
      <dt className="uppercase tracking-[0.18em] text-aegis-faint">{label}</dt>
      <dd className={toneClass}>{value}</dd>
    </div>
  );
}

/* ─── 2. Capability tickrow ─────────────────────────────────────────── */

function CapabilityTickRow() {
  const items: { kpi: string; label: string; sub: string }[] = [
    { kpi: '4ms', label: 'p50 decision', sub: 'in-region PDP' },
    { kpi: '3', label: 'cloud providers', sub: 'Azure, AWS, GCP' },
    { kpi: '0', label: 'long-lived secrets', sub: 'on agent disk' },
    { kpi: '∞', label: 'UCAN depth', sub: 'scope only narrows' },
  ];
  return (
    <section className="border-y border-aegis-line bg-aegis-surface/40">
      <div className="mx-auto max-w-[1280px] px-6 md:px-10">
        <div className="grid grid-cols-2 divide-aegis-line md:grid-cols-4 md:divide-x">
          {items.map((it, i) => (
            <div
              key={it.label}
              className={`px-2 py-7 ${i < 2 ? 'border-b border-aegis-line md:border-b-0' : ''}`}
            >
              <div className="font-display text-[44px] leading-none text-aegis-paper">{it.kpi}</div>
              <div className="eyebrow mt-3">{it.label}</div>
              <div className="mt-1 text-xs text-aegis-mute">{it.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── 3. How it works ───────────────────────────────────────────────── */

function HowItWorks() {
  const acts = [
    {
      n: '01',
      label: 'Connect',
      title: 'Cloud and SaaS, once.',
      body: 'Connect cloud accounts and SaaS once. Cloud trusts the Nomos OIDC issuer; SaaS refresh tokens stay encrypted server-side. Agents see only short-lived, scoped credentials minted per call.',
      icon: Cloud,
    },
    {
      n: '02',
      label: 'Author',
      title: 'Write Cedar — or compose visually.',
      body: 'Policies live in Cedar. The visual builder round-trips IR → Cedar → IR so what you save is what runs. Templates ship for every supported SaaS.',
      icon: FileLock2,
    },
    {
      n: '03',
      label: 'Run',
      title: 'PDP gates every call. Audit signs every chain.',
      body: 'PDP evaluates intent, mints UCAN, swaps for a real OAuth token, proxies. Each decision lands in a signed hash-chained audit log a verifier can independently re-walk — across single agents and swarms alike.',
      icon: Workflow,
    },
  ];
  return (
    <section className="mx-auto max-w-[1280px] px-6 py-32 md:px-10">
      <div className="grid grid-cols-12 gap-10">
        <div className="col-span-12 lg:col-span-4">
          <div className="eyebrow">how it works</div>
          <h2 className="display mt-5 text-[56px] text-aegis-paper">
            One runtime,
            <br />
            three <em>guarantees</em>.
          </h2>
          <p className="mt-6 max-w-[400px] text-base leading-relaxed text-aegis-mute">
            Nomos isn&rsquo;t a wrapper around your agent — it&rsquo;s the policy enforcement plane
            your agent calls into. Each act runs independently, but they compose into a single
            audited transaction.
          </p>
        </div>
        <div className="col-span-12 lg:col-span-8">
          <ol className="divide-y divide-aegis-line border-y border-aegis-line">
            {acts.map((a) => (
              <li key={a.n} className="grid grid-cols-12 items-start gap-5 py-10">
                <div className="col-span-2 lg:col-span-1">
                  <div className="font-display text-[28px] text-aegis-signal">{a.n}</div>
                </div>
                <div className="col-span-2 lg:col-span-1">
                  <a.icon className="h-6 w-6 text-aegis-paper" />
                </div>
                <div className="col-span-8 lg:col-span-10">
                  <div className="eyebrow">{a.label}</div>
                  <h3 className="display mt-2 text-[28px] leading-tight text-aegis-paper">
                    {a.title}
                  </h3>
                  <p className="mt-3 max-w-[600px] text-sm leading-relaxed text-aegis-mute">
                    {a.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* ─── 4. Cloud IAM ──────────────────────────────────────────────────── */

function CloudIAM() {
  const providers: {
    name: string;
    body: string;
    href: string;
  }[] = [
    {
      name: 'Azure',
      body: 'Workload identity federation. Write capability validated 2026-05-18.',
      href: '/app/cloud/connect/azure',
    },
    {
      name: 'AWS',
      body: 'STS AssumeRoleWithWebIdentity. Role per agent, session per call.',
      href: '/app/cloud/connect/aws',
    },
    {
      name: 'GCP',
      body: 'Workload Identity Pools. ID token → access token, per request.',
      href: '/app/cloud/connect/gcp',
    },
  ];
  return (
    <section className="mx-auto max-w-[1280px] px-6 py-32 md:px-10">
      <div className="grid grid-cols-12 gap-10">
        <div className="col-span-12 lg:col-span-4">
          <div className="eyebrow flex items-center gap-3">
            <Cloud className="h-4 w-4 text-aegis-signal" aria-hidden />
            cloud iam
          </div>
          <h2 className="display mt-5 text-[56px] leading-[1.02] text-aegis-paper">
            Federated keys.
            <br />
            <em>Zero</em> long-lived secrets.
          </h2>
          <p className="mt-6 max-w-[420px] text-base leading-relaxed text-aegis-mute">
            Your AWS, Azure, and GCP trust a Nomos-operated OIDC issuer. Agents request a token;
            Nomos mints provider-native, short-lived, scoped credentials. Nothing to rotate. Nothing
            to leak.
          </p>
          <Link
            href="/app/cloud"
            className="group mt-8 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-signal hover:text-aegis-paper"
          >
            Connect a cloud
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
        </div>
        <div className="col-span-12 lg:col-span-8">
          <ul className="divide-y divide-aegis-line border-y border-aegis-line">
            {providers.map((p) => (
              <li
                key={p.name}
                className="grid grid-cols-12 items-center gap-5 py-8 transition-colors hover:bg-aegis-surface/30"
              >
                <div className="col-span-2 lg:col-span-1">
                  <KeyRound className="h-6 w-6 text-aegis-paper" aria-hidden />
                </div>
                <div className="col-span-7 lg:col-span-8">
                  <div className="font-display text-[28px] leading-tight text-aegis-paper">
                    {p.name}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-aegis-mute">{p.body}</p>
                </div>
                <div className="col-span-3 lg:col-span-3 text-right">
                  <Link
                    href={p.href}
                    className="group inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-mute hover:text-aegis-signal"
                  >
                    connect
                    <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ─── 5. Swarms ─────────────────────────────────────────────────────── */

function Swarms() {
  const frameworks: { name: string; body: string; icon: typeof Workflow }[] = [
    {
      name: 'LangGraph',
      body: 'Subgraph nodes inherit the parent UCAN.',
      icon: Workflow,
    },
    {
      name: 'CrewAI',
      body: 'Crew → agent delegation traced in PDP.',
      icon: Users,
    },
    {
      name: 'AutoGen',
      body: 'GroupChat hand-offs as signed mints.',
      icon: GitBranch,
    },
    {
      name: 'Claude sub-agents',
      body: 'Each sub-agent gets a scoped chain.',
      icon: Sparkles,
    },
  ];
  return (
    <section className="border-y border-aegis-line bg-aegis-surface/30">
      <div className="mx-auto grid max-w-[1280px] grid-cols-12 gap-10 px-6 py-32 md:px-10">
        <div className="col-span-12">
          <div className="eyebrow flex items-center gap-3">
            <Network className="h-4 w-4 text-aegis-signal" aria-hidden />
            multi-agent swarms
          </div>
          <h2 className="display mt-5 max-w-[20ch] text-[56px] leading-[1.02] text-aegis-paper">
            Trees that <em>delegate</em>. Scope only narrows.
          </h2>
          <p className="mt-6 max-w-[680px] text-base leading-relaxed text-aegis-mute">
            A swarm is a tree of Apps. The root mints a child UCAN; every descendant carries the
            chain as proof. The PDP enforces attenuation — a child can never get back what the
            parent gave up.
          </p>
        </div>
        <div className="col-span-12 lg:col-span-7">
          <div className="corners relative h-full rounded-sm border border-aegis-line bg-aegis-ink p-7">
            <div className="eyebrow">ucan chain · attenuated</div>
            <pre className="mt-5 overflow-x-auto font-mono text-[12px] leading-[1.9] text-aegis-paper">
              {`root: planner-agent           kid 0x4d2c
 ├─ writer:branch             scope ⊆ planner
 ├─ researcher:branch         scope ⊆ planner
 │   └─ scraper:leaf          scope ⊆ researcher
 └─ release:branch            step-up required`}
            </pre>
            <div className="mt-6 flex items-center justify-between border-t border-aegis-line pt-4">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
                wire format
              </span>
              <span className="font-mono text-[10px] text-aegis-paper">
                NOMOS_PARENT_UCAN_CHAIN
              </span>
            </div>
          </div>
        </div>
        <div className="col-span-12 lg:col-span-5">
          <div className="grid h-full grid-cols-1 gap-px bg-aegis-line sm:grid-cols-2">
            {frameworks.map((f) => (
              <div
                key={f.name}
                className="bg-aegis-ink p-6 transition-colors hover:bg-aegis-surface/60"
              >
                <f.icon className="h-5 w-5 text-aegis-signal" aria-hidden />
                <div className="eyebrow mt-4">framework</div>
                <h3 className="display mt-2 text-[22px] leading-tight text-aegis-paper">
                  {f.name}
                </h3>
                <p className="mt-2 font-mono text-[11px] leading-relaxed text-aegis-mute">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </div>
        <div className="col-span-12">
          <Link
            href="/app/swarms"
            className="group inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-signal hover:text-aegis-paper"
          >
            Wire a swarm
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ─── 6. Monitoring ─────────────────────────────────────────────────── */

function Monitoring() {
  const tiles: {
    icon: typeof Activity;
    label: string;
    title: string;
    body: string;
  }[] = [
    {
      icon: Activity,
      label: 'decisions',
      title: 'Allow / Deny / Step-up.',
      body: 'Per-workspace breakdown over 1h / 24h / 7d. Signal, coral, amber — at a glance.',
    },
    {
      icon: GitGraph,
      label: 'action graph',
      title: 'Swarm call flows.',
      body: 'Reconstructed from UCAN chains. Click a node, see the policy decision that gated the edge.',
    },
    {
      icon: AlertTriangle,
      label: 'anomalies',
      title: 'Badges, not pages.',
      body: 'Out-of-pattern scopes, novel resources, denied retries — surfaced inline, never paged.',
    },
  ];
  return (
    <section className="mx-auto max-w-[1280px] px-6 py-32 md:px-10">
      <div className="grid grid-cols-12 gap-10">
        <div className="col-span-12 lg:col-span-4">
          <div className="eyebrow flex items-center gap-3">
            <Activity className="h-4 w-4 text-aegis-signal" aria-hidden />
            live monitoring
          </div>
          <h2 className="display mt-5 text-[56px] leading-[1.02] text-aegis-paper">
            Every call, <em>replayable</em>.
            <br />
            No new instrumentation.
          </h2>
          <p className="mt-6 max-w-[420px] text-base leading-relaxed text-aegis-mute">
            Allow / Deny / Step-up breakdowns, an ActionTimeline of every PDP decision, an
            ActionGraph of swarm call flows, and anomaly badges — all polled from the same
            hash-chained audit your verifier walks offline.
          </p>
          <Link
            href="/app/monitoring"
            className="group mt-8 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-signal hover:text-aegis-paper"
          >
            Open monitoring
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
        </div>
        <div className="col-span-12 grid grid-cols-1 gap-px bg-aegis-line lg:col-span-8">
          {tiles.map((t) => (
            <div
              key={t.title}
              className="bg-aegis-ink p-8 transition-colors hover:bg-aegis-surface/60"
            >
              <t.icon className="h-6 w-6 text-aegis-signal" aria-hidden />
              <div className="eyebrow mt-5">{t.label}</div>
              <h3 className="display mt-2 text-[26px] leading-tight text-aegis-paper">{t.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-aegis-mute">{t.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── 7. Integration marquee ────────────────────────────────────────── */

function IntegrationMarquee() {
  const integrations = [
    'GitHub',
    'Slack',
    'Google',
    'Notion',
    'Linear',
    'Stripe',
    'Calendar',
    'Filesystem',
    'GitHub',
    'Slack',
    'Google',
    'Notion',
    'Linear',
    'Stripe',
    'Calendar',
    'Filesystem',
  ];
  return (
    <section className="overflow-hidden border-y border-aegis-line bg-aegis-surface/30 py-10">
      <div className="mx-auto max-w-[1280px] px-6 md:px-10">
        <div className="mb-7 flex items-baseline justify-between">
          <div className="eyebrow">integrations</div>
          <Link
            href="/integrations"
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-mute hover:text-aegis-paper"
          >
            see all →
          </Link>
        </div>
      </div>
      <div className="marquee">
        {[...integrations, ...integrations].map((label, i) => (
          <div
            key={`${label}-${i}`}
            className="flex shrink-0 items-center gap-3 border-l border-aegis-line px-10 py-4 first:border-l-0"
          >
            <span className="grid h-7 w-7 place-items-center rounded-sm border border-aegis-line bg-aegis-surface font-mono text-[10px] text-aegis-paper">
              {label.slice(0, 2).toUpperCase()}
            </span>
            <span className="font-display text-[22px] text-aegis-paper/70">{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── 5. Security pillars ───────────────────────────────────────────── */

function SecurityPillars() {
  const pillars = [
    {
      icon: KeyRound,
      label: 'No long-lived keys',
      title: 'Tokens never reach your agent.',
      body: 'STS / WIF / OIDC federation for cloud. Per-call UCAN for SaaS. Nothing on agent disk to rotate.',
    },
    {
      icon: FileLock2,
      label: 'Policy as code',
      title: 'Cedar — formally verified.',
      body: 'AWS-grade policy language. Decisions are deterministic. The visual builder is a first-class second pen.',
    },
    {
      icon: ShieldCheck,
      label: 'Step-up by default',
      title: 'Passkey + cosigner UCAN.',
      body: 'High-stakes actions detect at policy time, push to your device, and require a passkey signature before mint.',
    },
    {
      icon: Hash,
      label: 'Audit you can replay',
      title: 'Hash chain + signed roots — replayable.',
      body: 'Every decision is a hash-chained record. A daily Ed25519 signature anchors the chain. Open-source verifier CLI.',
    },
  ];
  return (
    <section className="mx-auto max-w-[1280px] px-6 py-32 md:px-10">
      <div className="grid grid-cols-12 gap-10">
        <div className="col-span-12 lg:col-span-4">
          <div className="eyebrow">trust model</div>
          <h2 className="display mt-5 text-[56px] text-aegis-paper">
            Engineered for the
            <br />
            <em>blast radius</em>
            <br />
            of agents.
          </h2>
          <p className="mt-6 max-w-[420px] text-base leading-relaxed text-aegis-mute">
            Your AI agent is one prompt-injection away from a wire transfer. Nomos closes that gap
            by making the credential, the scope, and the audit a single cryptographic primitive.
          </p>
        </div>
        <div className="col-span-12 grid grid-cols-1 gap-px bg-aegis-line lg:col-span-8 lg:grid-cols-2">
          {pillars.map((p) => (
            <div
              key={p.title}
              className="bg-aegis-ink p-8 transition-colors hover:bg-aegis-surface/60"
            >
              <p.icon className="h-6 w-6 text-aegis-signal" />
              <div className="eyebrow mt-5">{p.label}</div>
              <h3 className="display mt-2 text-[26px] leading-tight text-aegis-paper">{p.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-aegis-mute">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── 6. Code preview + decision log ────────────────────────────────── */

function CodeAndDecisions() {
  return (
    <section className="border-y border-aegis-line bg-aegis-surface/30">
      <div className="mx-auto grid max-w-[1280px] grid-cols-12 gap-10 px-6 py-24 md:px-10">
        <div className="col-span-12 lg:col-span-7">
          <div className="eyebrow">three lines of code</div>
          <h2 className="display mt-5 text-[44px] text-aegis-paper">
            Drop the SDK in.
            <br />
            Nomos takes the rest.
          </h2>
          <p className="mt-5 max-w-[500px] text-sm leading-relaxed text-aegis-mute">
            The TypeScript SDK is fail-closed by default. If the PDP can&rsquo;t be reached, the
            call denies. Opening the gate is opt-in only — because security defaults are policy.
          </p>
          <pre className="mt-8 overflow-x-auto rounded-sm border border-aegis-line bg-aegis-ink p-6 font-mono text-[13px] leading-relaxed text-aegis-paper">
            {`import { createClient } from '@auto-nomos/sdk';

const aegis = createClient({
  apiKey: process.env.NOMOS_API_KEY,
});

// Anywhere in your agent — Nomos enforces, audits, returns.
await aegis.call('/github/issue/create', {
  repo: 'acme/website',
  title: 'Sentry alert: 500s on /checkout',
});`}
          </pre>
          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-faint">
            <span>npm i @auto-nomos/sdk</span>
            <span aria-hidden>·</span>
            <span>node ≥ 20</span>
            <span aria-hidden>·</span>
            <span>edge-runtime ✓</span>
          </div>
        </div>
        <div className="col-span-12 lg:col-span-5">
          <div className="corners relative rounded-sm border border-aegis-line bg-aegis-ink p-6">
            <div className="flex items-baseline justify-between">
              <div className="eyebrow">live audit · streaming</div>
              <span className="font-mono text-[10px] text-aegis-faint">↓ tail</span>
            </div>
            <ul className="mt-5 divide-y divide-aegis-line/60 font-mono text-[11px]">
              {[
                {
                  ts: '14:22:08.911',
                  act: 'allow',
                  det: 'release-bot · /github/issue/create',
                  tone: 'signal',
                },
                {
                  ts: '14:22:08.418',
                  act: 'step-up',
                  det: 'release-bot · /github/repo/transfer',
                  tone: 'amber',
                },
                {
                  ts: '14:22:07.802',
                  act: 'allow',
                  det: 'release-bot · /aws/sts/assume',
                  tone: 'signal',
                },
                {
                  ts: '14:22:06.514',
                  act: 'deny',
                  det: 'fin-bot · /stripe/charge/refund',
                  tone: 'coral',
                },
                {
                  ts: '14:22:05.220',
                  act: 'allow',
                  det: 'planner → writer · ucan-mint',
                  tone: 'signal',
                },
                {
                  ts: '14:22:03.911',
                  act: 'allow',
                  det: 'support-bot · /notion/page/read',
                  tone: 'signal',
                },
              ].map((r, i) => (
                <li key={i} className="grid grid-cols-[100px_70px_1fr] items-center gap-3 py-2.5">
                  <span className="text-aegis-faint">{r.ts}</span>
                  <span
                    className={
                      r.tone === 'signal'
                        ? 'text-aegis-signal'
                        : r.tone === 'coral'
                          ? 'text-aegis-coral'
                          : 'text-aegis-amber'
                    }
                  >
                    {r.act}
                  </span>
                  <span className="truncate text-aegis-paper">{r.det}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 border-t border-aegis-line pt-4">
              <Link
                href="/docs#audit"
                className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-paper hover:text-aegis-signal"
              >
                <Hash className="h-3.5 w-3.5" />
                read about the chain →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── 7. Use cases ──────────────────────────────────────────────────── */

function UseCases() {
  const cases = [
    {
      icon: Boxes,
      title: 'Platform teams',
      body: 'Hand engineering teams a cloud account they can ship to without leaking long-lived keys. STS, WIF, and OIDC federation, per-agent.',
    },
    {
      icon: Workflow,
      title: 'Agent framework authors',
      body: 'LangGraph, CrewAI, AutoGen, Claude sub-agents. UCAN chains travel with your graph for free — scope only narrows downstream.',
    },
    {
      icon: Sparkles,
      title: 'Security & compliance',
      body: 'Replay any decision from the signed audit. SOC2 evidence is a CLI call. Cross-tenant invariants tested at every release.',
    },
  ];
  return (
    <section className="mx-auto max-w-[1280px] px-6 py-32 md:px-10">
      <div className="grid grid-cols-12 gap-10">
        <div className="col-span-12 lg:col-span-3">
          <div className="eyebrow">where it fits</div>
        </div>
        <div className="col-span-12 lg:col-span-9">
          <h2 className="display max-w-[16ch] text-[56px] text-aegis-paper">
            Built for the people
            <br />
            shipping <em>real</em> agents.
          </h2>
        </div>
      </div>
      <div className="mt-16 grid grid-cols-1 gap-px bg-aegis-line md:grid-cols-3">
        {cases.map((c) => (
          <div
            key={c.title}
            className="bg-aegis-ink p-10 transition-colors hover:bg-aegis-surface/50"
          >
            <c.icon className="h-7 w-7 text-aegis-signal" />
            <h3 className="display mt-6 text-[26px] leading-tight text-aegis-paper">{c.title}</h3>
            <p className="mt-4 text-sm leading-relaxed text-aegis-mute">{c.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── 8. Reading list ───────────────────────────────────────────────── */

function ReadingList() {
  const items = [
    {
      href: '/docs#mental-model',
      label: 'The mental model',
      sub: 'Why agents need a credential broker.',
    },
    {
      href: '/docs#cloud-iam',
      label: 'Cloud IAM',
      sub: 'Federated OIDC, per-provider setup.',
    },
    {
      href: '/docs#swarms',
      label: 'Multi-agent swarms',
      sub: 'UCAN chains across LangGraph, CrewAI, AutoGen.',
    },
    {
      href: '/docs#policies',
      label: 'Policy authoring',
      sub: 'Cedar text + visual builder, side-by-side.',
    },
    { href: '/docs#audit', label: 'Audit chain', sub: 'Hash chain, daily roots, R2 archive.' },
    { href: '/security', label: 'Security posture', sub: 'Crypto, tenancy, secret handling.' },
  ];
  return (
    <section className="border-y border-aegis-line bg-aegis-surface/30">
      <div className="mx-auto max-w-[1280px] px-6 py-24 md:px-10">
        <div className="mb-12 flex items-baseline justify-between">
          <div>
            <div className="eyebrow">reading list</div>
            <h2 className="display mt-4 text-[44px] text-aegis-paper">The next 12 minutes.</h2>
          </div>
          <Link
            href="/docs"
            className="hidden font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-mute hover:text-aegis-paper md:inline-flex"
          >
            full table of contents →
          </Link>
        </div>
        <ul className="grid grid-cols-1 gap-px bg-aegis-line md:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => (
            <li key={it.href} className="bg-aegis-ink">
              <Link
                href={it.href}
                className="group flex items-start justify-between gap-4 p-7 transition-colors hover:bg-aegis-surface/60"
              >
                <div>
                  <div className="font-display text-[20px] text-aegis-paper">{it.label}</div>
                  <div className="mt-2 text-sm text-aegis-mute">{it.sub}</div>
                </div>
                <ArrowUpRight className="h-4 w-4 text-aegis-faint transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-aegis-signal" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ─── 9. Bottom CTA ─────────────────────────────────────────────────── */

function BottomCta() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-[1280px] grid-cols-12 gap-10 px-6 py-32 md:px-10">
        <div className="col-span-12 lg:col-span-7">
          <h2 className="display text-[64px] leading-[0.95] text-aegis-paper md:text-[88px]">
            Give your agents
            <br />
            <em>shoulders to stand on</em>.
          </h2>
          <p className="mt-7 max-w-[520px] text-base leading-relaxed text-aegis-mute">
            Free during open beta. No credit card. Connect your first SaaS and watch your first
            audited decision in minutes.
          </p>
        </div>
        <div className="col-span-12 lg:col-span-5">
          <div className="corners relative h-full rounded-sm border border-aegis-line bg-aegis-surface/40 p-8">
            <div className="eyebrow">begin</div>
            <ol className="mt-4 space-y-3 font-mono text-sm text-aegis-paper">
              <li>1. Create a workspace</li>
              <li>2. Connect a SaaS provider</li>
              <li>3. Register your first App</li>
              <li>4. Drop the SDK into your agent</li>
            </ol>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/sign-up"
                className="inline-flex items-center gap-2 rounded-sm bg-aegis-signal px-5 py-3 font-mono text-[12px] uppercase tracking-[0.18em] text-aegis-ink transition-colors hover:bg-aegis-signal/90"
              >
                Create account
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/docs"
                className="inline-flex items-center gap-2 rounded-sm border border-aegis-line px-5 py-3 font-mono text-[12px] uppercase tracking-[0.18em] text-aegis-paper transition-colors hover:border-aegis-line-strong"
              >
                Read the docs
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
