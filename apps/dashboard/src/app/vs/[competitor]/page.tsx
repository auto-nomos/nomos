import { ArrowRight, ArrowUpRight, Check, Minus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Script from 'next/script';
import { PublicShell } from '../../../components/nomos/public-shell';
import {
  COMPARISON_IDS,
  COMPARISONS,
  type Comparison,
  type ComparisonId,
} from '../../../lib/comparisons';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://auto-nomos.com';

type Params = Promise<{ competitor: string }>;

export function generateStaticParams() {
  return COMPARISON_IDS.map((id) => ({ competitor: id }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { competitor } = await params;
  const c = COMPARISONS[competitor as ComparisonId];
  if (!c) return {};
  return {
    title: `Nomos vs ${c.name}`,
    description: c.heroSub,
    alternates: { canonical: `/vs/${c.id}` },
    openGraph: {
      title: `Nomos vs ${c.name} — ${c.oneLine}`,
      description: c.heroSub,
    },
  };
}

export default async function ComparisonPage({ params }: { params: Params }) {
  const { competitor } = await params;
  const c = COMPARISONS[competitor as ComparisonId];
  if (!c) notFound();

  const breadcrumbsLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Comparisons', item: `${SITE_URL}/vs` },
      {
        '@type': 'ListItem',
        position: 3,
        name: `Nomos vs ${c.name}`,
        item: `${SITE_URL}/vs/${c.id}`,
      },
    ],
  };

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: c.faq.map((q) => ({
      '@type': 'Question',
      name: q.q,
      acceptedAnswer: { '@type': 'Answer', text: q.a },
    })),
  };

  return (
    <PublicShell>
      <Script
        id={`ld-bc-${c.id}`}
        type="application/ld+json"
        strategy="afterInteractive"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: canonical JSON-LD injection
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbsLd) }}
      />
      <Script
        id={`ld-faq-${c.id}`}
        type="application/ld+json"
        strategy="afterInteractive"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: canonical JSON-LD injection
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />

      <Hero c={c} />
      <Table c={c} />
      <Faq c={c} />
      <Bottom c={c} />
    </PublicShell>
  );
}

function Hero({ c }: { c: Comparison }) {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto max-w-[1280px] px-6 pt-24 pb-20 md:px-10 md:pt-32">
        <nav className="font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-faint">
          <Link href="/" className="hover:text-aegis-paper">
            home
          </Link>{' '}
          / comparisons / <span className="text-aegis-paper">nomos vs {c.name.toLowerCase()}</span>
        </nav>
        <div className="eyebrow mt-8 flex items-center gap-3">
          <span className="pulse" />
          <span>Comparison · {c.category}</span>
        </div>
        <h1 className="display mt-7 max-w-[20ch] text-[64px] text-aegis-paper md:text-[88px]">
          {c.heroClaim}
        </h1>
        <p className="mt-8 max-w-[720px] text-lg leading-relaxed text-aegis-mute">{c.heroSub}</p>
        <p className="mt-6 max-w-[720px] font-mono text-sm text-aegis-signal">{c.oneLine}</p>
      </div>
      <div className="rule" />
    </section>
  );
}

function Table({ c }: { c: Comparison }) {
  return (
    <section className="mx-auto max-w-[1280px] px-6 py-24 md:px-10">
      <div className="grid grid-cols-12 gap-10">
        <div className="col-span-12 lg:col-span-4">
          <div className="eyebrow">the receipts</div>
          <h2 className="display mt-5 text-[44px] text-aegis-paper">
            Feature by feature.
            <br />
            <em>No hedging.</em>
          </h2>
          <p className="mt-6 max-w-[420px] text-base leading-relaxed text-aegis-mute">
            Every row is a thing your agent will actually do. If we marked a cell wrong, tell us in
            Discussions — we&rsquo;ll fix it the same week.
          </p>
        </div>
        <div className="col-span-12 lg:col-span-8">
          <div className="corners relative overflow-x-auto rounded-sm border border-aegis-line bg-aegis-ink">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead>
                <tr className="border-b border-aegis-line font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
                  <th className="px-6 py-4 font-normal">feature</th>
                  <th className="px-4 py-4 text-center font-normal">{c.name}</th>
                  <th className="border-l border-aegis-line bg-aegis-signal/5 px-4 py-4 text-center font-normal text-aegis-signal">
                    Nomos
                  </th>
                </tr>
              </thead>
              <tbody>
                {c.rows.map((r, ri) => (
                  <tr
                    key={r.feature}
                    className={ri === c.rows.length - 1 ? '' : 'border-b border-aegis-line/60'}
                  >
                    <th className="px-6 py-4 text-left text-sm font-normal text-aegis-paper">
                      {r.feature}
                    </th>
                    <td className="px-4 py-4 text-center font-mono text-[11px] text-aegis-mute">
                      <Cell value={r.competitor} />
                    </td>
                    <td className="border-l border-aegis-line bg-aegis-signal/5 px-4 py-4 text-center font-mono text-[11px] text-aegis-signal">
                      <Cell value={r.nomos} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

function Cell({ value }: { value: boolean | string }) {
  if (value === true) return <Check className="mx-auto h-4 w-4" />;
  if (value === false) return <Minus className="mx-auto h-4 w-4 text-aegis-faint" />;
  return <span className="uppercase tracking-[0.18em] text-aegis-amber">{value}</span>;
}

function Faq({ c }: { c: Comparison }) {
  return (
    <section className="border-y border-aegis-line bg-aegis-surface/30">
      <div className="mx-auto max-w-[1280px] px-6 py-24 md:px-10">
        <div className="eyebrow">honest questions</div>
        <h2 className="display mt-5 max-w-[20ch] text-[44px] text-aegis-paper">
          What people actually ask.
        </h2>
        <dl className="mt-12 divide-y divide-aegis-line border-y border-aegis-line">
          {c.faq.map((q) => (
            <div key={q.q} className="grid grid-cols-12 gap-6 py-8">
              <dt className="col-span-12 font-display text-[24px] text-aegis-paper lg:col-span-5">
                {q.q}
              </dt>
              <dd className="col-span-12 text-base leading-relaxed text-aegis-mute lg:col-span-7">
                {q.a}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function Bottom({ c }: { c: Comparison }) {
  const others = COMPARISON_IDS.filter((id) => id !== c.id);
  return (
    <section className="mx-auto max-w-[1280px] px-6 py-24 md:px-10">
      <div className="grid grid-cols-12 gap-10">
        <div className="col-span-12 lg:col-span-6">
          <h2 className="display text-[44px] text-aegis-paper md:text-[56px]">
            Try Nomos. <em>It&rsquo;s free.</em>
          </h2>
          <p className="mt-6 max-w-[440px] text-base leading-relaxed text-aegis-mute">
            Open beta. No credit card. Plug an agent in, see your first audited decision in minutes.
            Self-host on the waitlist when you&rsquo;re ready.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 rounded-sm bg-aegis-signal px-5 py-3 font-mono text-[12px] uppercase tracking-[0.18em] text-aegis-ink"
            >
              Start free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/open-source"
              className="inline-flex items-center gap-2 rounded-sm border border-aegis-line px-5 py-3 font-mono text-[12px] uppercase tracking-[0.18em] text-aegis-paper hover:border-aegis-signal hover:text-aegis-signal"
            >
              Open source roadmap
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
        <div className="col-span-12 lg:col-span-6">
          <div className="eyebrow">more comparisons</div>
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {others.map((id) => {
              const o = COMPARISONS[id];
              return (
                <li key={id}>
                  <Link
                    href={`/vs/${id}`}
                    className="group flex items-center justify-between gap-3 rounded-sm border border-aegis-line bg-aegis-ink px-5 py-4 transition-colors hover:border-aegis-signal/40 hover:bg-aegis-surface/60"
                  >
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
                        nomos vs
                      </div>
                      <div className="mt-1 font-display text-[18px] text-aegis-paper">{o.name}</div>
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-aegis-faint group-hover:text-aegis-signal" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
