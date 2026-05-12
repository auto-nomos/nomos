/* ======================================================================
   Nomos — pricing
   ----------------------------------------------------------------------
   Per design appendix D13 (Stripe Checkout single-tier; pricing on
   landing page read-only). Three tiers map to PLAN_CAPS in
   apps/control-plane/src/services/usage.ts. Free tier number stays in
   sync with the gate; Pro tier is the Stripe Checkout target.
   Enterprise pricing is hidden behind a "Talk to sales" CTA — no
   public number until we have one signed.
   ====================================================================== */

import { ArrowRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { PublicShell } from '../../components/nomos/public-shell';

interface Tier {
  id: 'free' | 'pro' | 'enterprise';
  name: string;
  price: string;
  cadence?: string;
  blurb: string;
  cta: { label: string; href: string };
  features: string[];
  highlight?: boolean;
}

const TIERS: Tier[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    cadence: 'forever',
    blurb: 'Build, prototype, ship a side-project agent — no card required.',
    cta: { label: 'Start free', href: '/sign-up' },
    features: [
      '1,000 UCAN mints + 1,000 proxy calls / month',
      'Hash-chained audit log + signed daily roots',
      'GitHub / Slack / Google / Notion connectors',
      'Visual policy builder + Cedar editor',
      'Community support (Discord)',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$49',
    cadence: 'per workspace / month',
    blurb: 'Production agents with audit retention and an SLA.',
    cta: { label: 'Upgrade in app', href: '/sign-up' },
    features: [
      '100,000 UCAN mints + 100,000 proxy calls / month',
      '90-day hot audit retention; 7-year cold archive (R2)',
      'Step-up approvals via passkey + Telegram',
      'Email support · 1 business-day response',
      'Stripe Checkout · cancel any time',
    ],
    highlight: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    blurb: 'Self-hosted PDP, SOC2 evidence, federation, regional residency.',
    cta: { label: 'Talk to sales', href: 'mailto:sales@auto-nomos.com' },
    features: [
      'Unlimited usage · per-PDP licensing',
      'Customer-managed keys + multi-region control plane',
      'SOC2 Type I/II evidence package (post-audit)',
      'SCIM + OIDC IdP federation',
      'Slack-connect support · 4-hour SLA',
    ],
  },
];

export default function PricingPage() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-[1200px] px-6 py-16 md:px-10 md:py-24">
        <header className="max-w-[760px]">
          <div className="eyebrow">pricing</div>
          <h1 className="display mt-4 text-[56px] leading-tight text-aegis-paper md:text-[72px]">
            Price tracks <em>usage</em>, not seats.
          </h1>
          <p className="mt-5 max-w-[560px] text-sm leading-relaxed text-aegis-mute md:text-base">
            One free workspace forever. Upgrade only when your agents cross the cap. Enterprise
            terms when you need self-hosting, SOC2 evidence, or regional residency.
          </p>
        </header>

        <section className="mt-16 grid gap-px overflow-hidden rounded-sm border border-aegis-line bg-aegis-line md:grid-cols-3">
          {TIERS.map((tier) => (
            <TierCard key={tier.id} tier={tier} />
          ))}
        </section>

        <section className="mt-20 rounded-sm border border-aegis-line bg-aegis-surface/60 p-8 md:p-12">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <div className="eyebrow">how the meter works</div>
              <h2 className="mt-3 font-display text-3xl text-aegis-paper">
                Every call counts <em>once</em>.
              </h2>
            </div>
            <ol className="space-y-4 text-sm leading-relaxed text-aegis-mute">
              <Step
                n="01"
                title="UCAN mint counts as 1"
                body="Each /v1/mint-ucan call from your SDK costs one credit. UCANs are reused until expiry — there's no per-API-call mint."
              />
              <Step
                n="02"
                title="Proxy call counts as 1"
                body="Each /v1/proxy hit through the PDP costs one credit. Denies, step-ups, and allows all count the same — the audit row is what you're paying for."
              />
              <Step
                n="03"
                title="Resets the 1st (UTC)"
                body="Counter zeros at the start of each calendar month. No prorating; carryovers are not a feature."
              />
            </ol>
          </div>
        </section>

        <section className="mt-16">
          <div className="eyebrow">frequently asked</div>
          <div className="mt-6 grid gap-px overflow-hidden rounded-sm border border-aegis-line bg-aegis-line md:grid-cols-2">
            <Faq
              q="What happens at the cap?"
              a="The mint endpoint returns 402 with error_code=quota_exceeded. Existing UCANs keep working until they expire; new ones wait until reset or upgrade."
            />
            <Faq
              q="Can I see usage live?"
              a="Yes. /app/billing surfaces the current period's count, a horizontal meter, and the days-to-reset. A banner appears at 80% and again when exhausted."
            />
            <Faq
              q="Is this metered through Stripe?"
              a="Stripe handles the recurring Pro charge today. Per-request meter sync to Stripe Meter API is on the post-wedge roadmap; the column is there, the worker is not yet shipped."
            />
            <Faq
              q="What's NOT counted?"
              a="Dashboard reads, OAuth flows, passkey enrollment, and webhook events do not consume credits. Only mint + proxy."
            />
          </div>
        </section>
      </div>
    </PublicShell>
  );
}

function TierCard({ tier }: { tier: Tier }) {
  return (
    <article
      className={
        tier.highlight
          ? 'flex flex-col gap-6 bg-aegis-surface-2 p-8 md:p-10'
          : 'flex flex-col gap-6 bg-aegis-ink p-8 md:p-10'
      }
      data-testid={`tier-${tier.id}`}
    >
      <div>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-2xl text-aegis-paper">{tier.name}</h3>
          {tier.highlight && (
            <span className="rounded-sm border border-aegis-signal/40 bg-aegis-signal/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-aegis-signal">
              recommended
            </span>
          )}
        </div>
        <div className="mt-4 flex items-baseline gap-2">
          <span className="font-display text-4xl text-aegis-paper">{tier.price}</span>
          {tier.cadence && (
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-aegis-mute">
              {tier.cadence}
            </span>
          )}
        </div>
        <p className="mt-3 text-sm leading-relaxed text-aegis-mute">{tier.blurb}</p>
      </div>

      <Link
        href={tier.cta.href}
        className={
          tier.highlight
            ? 'group inline-flex items-center justify-center gap-2 rounded-sm bg-aegis-signal px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-ink transition-colors hover:bg-aegis-signal/90'
            : 'group inline-flex items-center justify-center gap-2 rounded-sm border border-aegis-line bg-aegis-surface-2 px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-paper transition-colors hover:border-aegis-line-strong'
        }
      >
        {tier.cta.label}
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </Link>

      <ul className="space-y-2.5 text-sm text-aegis-mute">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-aegis-signal" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <li className="grid grid-cols-[42px_minmax(0,1fr)] gap-3">
      <div className="font-display text-2xl leading-none text-aegis-signal">{n}</div>
      <div>
        <p className="text-sm font-medium text-aegis-paper">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-aegis-mute">{body}</p>
      </div>
    </li>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div className="bg-aegis-ink p-6">
      <p className="font-display text-lg text-aegis-paper">{q}</p>
      <p className="mt-2 text-sm leading-relaxed text-aegis-mute">{a}</p>
    </div>
  );
}
