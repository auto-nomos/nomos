import { ArrowRight, BookOpen, Terminal } from 'lucide-react';
import Link from 'next/link';

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-[1280px] grid-cols-12 gap-10 px-6 pt-24 pb-24 md:px-10 md:pt-32 md:pb-28">
        <div className="col-span-12 lg:col-span-8" data-stagger>
          <div className="eyebrow flex items-center gap-3">
            <span className="pulse" />
            <span>Get started · 10 minutes · four paths</span>
          </div>
          <h1 className="display mt-7 max-w-[16ch] text-[56px] text-aegis-paper md:text-[88px] lg:text-[104px]">
            Your first <em>authorized</em>
            <br />
            call in 10 minutes.
          </h1>
          <p className="mt-8 max-w-[640px] text-lg leading-relaxed text-aegis-mute md:text-xl">
            Connect an agent. Create an app. Attach a policy. Trigger a call. Every step shows the
            exact command for the path that fits how you work — CLI, MCP, TypeScript SDK, or Python
            SDK. Pick once; it sticks across steps.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              href="/sign-up"
              className="group inline-flex items-center gap-2 rounded-sm bg-aegis-signal px-5 py-3 font-mono text-[12px] uppercase tracking-[0.18em] text-aegis-ink transition-colors hover:bg-aegis-signal/90"
            >
              Create account
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/docs/get-started/quickstart"
              className="group inline-flex items-center gap-2 rounded-sm border border-aegis-line px-5 py-3 font-mono text-[12px] uppercase tracking-[0.18em] text-aegis-paper transition-colors hover:border-aegis-signal hover:text-aegis-signal"
            >
              <BookOpen className="h-4 w-4" />
              Read the quickstart
            </Link>
            <Link
              href="#step-1"
              className="group inline-flex items-center gap-2 rounded-sm border border-aegis-line px-5 py-3 font-mono text-[12px] uppercase tracking-[0.18em] text-aegis-mute transition-colors hover:border-aegis-line-strong hover:text-aegis-paper"
            >
              <Terminal className="h-4 w-4" />
              Start here
            </Link>
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
          <div className="corners relative rounded-sm border border-aegis-line bg-aegis-surface/50 p-7 backdrop-blur">
            <div className="eyebrow">the four steps</div>
            <ol className="mt-5 space-y-3">
              {STEPS.map((s, i) => (
                <li key={s.label} className="flex items-start gap-3">
                  <span className="font-display text-[24px] leading-none text-aegis-signal">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <div className="font-display text-[16px] text-aegis-paper">{s.label}</div>
                    <div className="text-[12px] text-aegis-mute">{s.sub}</div>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-6 border-t border-aegis-line pt-5">
              <div className="eyebrow mb-3">picks-up where you left off</div>
              <p className="font-mono text-[11px] leading-relaxed text-aegis-mute">
                Path selection (CLI / MCP / SDK · TS / SDK · Py) syncs across every step on this
                page.
              </p>
            </div>
          </div>
        </aside>
      </div>
      <div className="rule" />
    </section>
  );
}

const STEPS = [
  { label: 'Connect an agent', sub: 'API key in CLI, MCP config, or SDK init.' },
  { label: 'Create an App', sub: 'One DID per agent identity.' },
  { label: 'Attach a policy', sub: 'Starter template or visual builder.' },
  { label: 'Trigger your first call', sub: 'UCAN → PDP → audit row.' },
];
