import { ArrowRight, Boxes, Cpu, FileLock2, Plug, Settings2 } from 'lucide-react';
import Link from 'next/link';
import { PublicShell } from '../../components/nomos/public-shell';
import { getAllDocs, JOURNEYS } from '../../lib/docs';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'get-started': Cpu,
  connect: Plug,
  providers: Boxes,
  policies: FileLock2,
  operate: Settings2,
};

export default function DocsLandingPage() {
  const docs = getAllDocs();
  return (
    <PublicShell>
      <div className="mx-auto max-w-[1280px] px-6 py-16 md:px-10 md:py-24">
        <header className="max-w-[820px]">
          <div className="eyebrow">docs</div>
          <h1 className="display mt-4 text-[56px] leading-tight text-aegis-paper">
            <em>Pick</em> your path.
          </h1>
          <p className="mt-5 max-w-[560px] text-sm leading-relaxed text-aegis-mute">
            Each journey is one continuous tutorial — every page assumes you've done the previous
            one. New to Nomos? Start with{' '}
            <Link
              href="/docs/get-started/what-is-nomos"
              className="text-aegis-signal underline-offset-2 hover:underline"
            >
              Get started
            </Link>
            .
          </p>
        </header>

        <section className="mt-14 grid gap-px overflow-hidden rounded-sm border border-aegis-line bg-aegis-line md:grid-cols-2 lg:grid-cols-5">
          {JOURNEYS.map((journey) => {
            const Icon = ICONS[journey.id] ?? Cpu;
            const first = docs.find((d) => d.journey === journey.id);
            const count = docs.filter((d) => d.journey === journey.id).length;
            const href = first ? `/docs/${first.slug.join('/')}` : `/docs/${journey.id}/index`;
            return (
              <Link
                key={journey.id}
                href={href}
                className="group flex flex-col gap-4 bg-aegis-ink p-6 transition-colors hover:bg-aegis-surface-2"
              >
                <Icon className="h-5 w-5 text-aegis-signal" />
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
                  {count} {count === 1 ? 'tutorial' : 'tutorials'}
                </div>
                <p className="font-display text-2xl text-aegis-paper">{journey.label}</p>
                <p className="text-sm leading-relaxed text-aegis-mute">{journey.description}</p>
                <span className="mt-auto inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-mute transition-colors group-hover:text-aegis-paper">
                  read{' '}
                  <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            );
          })}
        </section>

        <section className="mt-20">
          <div className="eyebrow mb-6">most read</div>
          <div className="grid gap-px overflow-hidden rounded-sm border border-aegis-line bg-aegis-line md:grid-cols-3">
            {[
              {
                slug: 'connect/cursor',
                title: 'Connect Cursor',
                description: 'Drop Nomos into Cursor MCP in three commands.',
              },
              {
                slug: 'connect/claude-desktop',
                title: 'Connect Claude Desktop',
                description: 'One JSON file, copy-paste-ready.',
              },
              {
                slug: 'policies/templates',
                title: 'Pick a starter policy',
                description: '20 templates across 12 providers.',
              },
            ].map((card) => (
              <Link
                key={card.slug}
                href={`/docs/${card.slug}`}
                className="group flex flex-col gap-2 bg-aegis-ink p-6 transition-colors hover:bg-aegis-surface-2"
              >
                <span className="font-display text-[18px] text-aegis-paper">{card.title}</span>
                <span className="text-[13px] leading-relaxed text-aegis-mute">
                  {card.description}
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </PublicShell>
  );
}
