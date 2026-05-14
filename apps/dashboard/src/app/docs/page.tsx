'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { GuideContent } from '../../components/nomos/guide';
import { PublicShell } from '../../components/nomos/public-shell';

/* Public docs: same long-form guide rendered inside the marketing shell.
   Auth-gated /app/guide is the in-product mirror — both use the same
   underlying component so the docs never drift between the two contexts.
   Three anchor cards up top satisfy the design-appendix IA spec for
   docs-landing (Quick start / Concepts / API ref). */

const ANCHORS = [
  {
    href: '/docs#quickstart',
    eyebrow: '01 · quickstart',
    title: 'Five-minute setup',
    body: 'Sign up, connect GitHub, register your App, mint your first UCAN, run a real curl.',
  },
  {
    href: '/docs#mental-model',
    eyebrow: '02 · concepts',
    title: 'Mental model',
    body: 'UCAN, PDP, Cedar, audit chain, step-up. The five primitives that make the rest make sense.',
  },
  {
    href: '/docs#swarms',
    eyebrow: '03 · beta · maos',
    title: 'Swarms (delegation chains)',
    body: 'Multi-agent orchestration security: parent → child UCAN propagation, scope containment, swarm-scoped approval.',
  },
  {
    href: '/docs#cloud',
    eyebrow: '04 · beta · cloud',
    title: 'Cloud IAM (Azure / AWS / GCP)',
    body: 'Federated cloud access via id.auto-nomos.com. No stored secrets — STS / AAD / WIF token exchange per request.',
  },
];

export default function DocsPage() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-[1280px] px-6 py-16 md:px-10 md:py-24">
        <header className="max-w-[720px]">
          <div className="eyebrow">docs</div>
          <h1 className="display mt-4 text-[56px] leading-tight text-aegis-paper">
            Read once. <em>Build</em>.
          </h1>
          <p className="mt-5 max-w-[520px] text-sm leading-relaxed text-aegis-mute">
            One scroll covers the full concept surface; jump straight to a section using the cards
            below or the TOC on the right.
          </p>
        </header>

        <section className="mt-12 grid gap-px overflow-hidden rounded-sm border border-aegis-line bg-aegis-line md:grid-cols-2 lg:grid-cols-4">
          {ANCHORS.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="group flex flex-col gap-3 bg-aegis-ink p-6 transition-colors hover:bg-aegis-surface-2"
            >
              <div className="eyebrow">{a.eyebrow}</div>
              <p className="font-display text-2xl text-aegis-paper">{a.title}</p>
              <p className="text-sm leading-relaxed text-aegis-mute">{a.body}</p>
              <span className="mt-auto inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-mute transition-colors group-hover:text-aegis-paper">
                read{' '}
                <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </section>

        <div className="mt-16">
          <GuideContent />
        </div>
      </div>
    </PublicShell>
  );
}
