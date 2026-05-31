import { ArrowRight, ArrowUpRight, Github, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { DISCORD_INVITE_URL, GITHUB_REPO_URL } from '../../lib/community-links';

/**
 * Band 1 — Hero. One idea: your agent should never hold a key it could leak.
 * Three CTAs in priority order: Start free, View on GitHub, Join Discord.
 * Live-feed panel on the right anchors the abstract claim in real signal.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-[1280px] grid-cols-12 gap-10 px-4 pt-16 pb-24 sm:px-6 sm:pt-24 sm:pb-32 md:px-10 md:pt-32">
        <div className="col-span-12 lg:col-span-8" data-stagger>
          <div className="eyebrow flex items-center gap-3">
            <span className="pulse" />
            <span>Open source soon · MCP-native · v0.1.x beta</span>
          </div>
          <h1 className="display mt-7 max-w-[12ch] text-[44px] leading-[1.02] text-aegis-paper sm:text-[64px] md:text-[96px] lg:text-[112px]">
            Agents need <em>guardrails</em>.
            <br />
            Not guesswork.
          </h1>
          <p className="mt-7 max-w-[640px] text-base leading-relaxed text-aegis-mute sm:mt-9 sm:text-lg md:text-xl">
            Scoped permissions, signed actions, replayable audit. Nomos is the control plane between
            your AI agents and the world — every action authorized, every scope narrowed, every
            decision witnessed. Open source on GitHub.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              href="/sign-up"
              className="group inline-flex items-center gap-2 rounded-sm bg-aegis-signal px-5 py-3 font-mono text-[12px] uppercase tracking-[0.18em] text-aegis-ink transition-colors hover:bg-aegis-signal/90"
            >
              Start free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="group inline-flex items-center gap-2 rounded-sm border border-aegis-line px-5 py-3 font-mono text-[12px] uppercase tracking-[0.18em] text-aegis-paper transition-colors hover:border-aegis-signal hover:text-aegis-signal"
            >
              <Github className="h-4 w-4" />
              View on GitHub
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </a>
            <a
              href={DISCORD_INVITE_URL}
              target="_blank"
              rel="noreferrer"
              className="group inline-flex items-center gap-2 rounded-sm border border-aegis-line px-5 py-3 font-mono text-[12px] uppercase tracking-[0.18em] text-aegis-mute transition-colors hover:border-aegis-line-strong hover:text-aegis-paper"
            >
              <MessageCircle className="h-4 w-4" />
              Join Discord
            </a>
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-3 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-faint">
            <span>No credit card</span>
            <span aria-hidden>·</span>
            <span>1k decisions free/mo</span>
            <span aria-hidden>·</span>
            <span>Self-host coming</span>
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
          <Row label="decisions" value="14,922" />
          <Row label="allow" value="92%" tone="signal" />
          <Row label="step-up" value="6%" />
          <Row label="deny" value="2%" />
          <Row label="oss" value="public-soon" tone="signal" />
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
  tone = 'paper',
}: {
  label: string;
  value: string;
  tone?: 'paper' | 'signal';
}) {
  const toneClass = tone === 'signal' ? 'text-aegis-signal' : 'text-aegis-paper';
  return (
    <div className="flex items-center justify-between border-b border-aegis-line/60 pb-2.5">
      <dt className="uppercase tracking-[0.18em] text-aegis-faint">{label}</dt>
      <dd className={toneClass}>{value}</dd>
    </div>
  );
}
