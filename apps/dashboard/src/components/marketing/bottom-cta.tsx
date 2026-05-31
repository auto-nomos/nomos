import { ArrowRight, ArrowUpRight, Cloud, Server } from 'lucide-react';
import Link from 'next/link';
import { GITHUB_REPO_URL } from '../../lib/community-links';

/**
 * Band 12 — Bottom CTA. One idea: two paths, no friction. Use hosted free
 * beta, or join the self-host waitlist. Both route through /sign-up with an
 * intent param so we get the signal without a new schema.
 */
export function BottomCta() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-[1280px] grid-cols-12 gap-10 px-4 py-20 sm:px-6 sm:py-28 md:px-10 md:py-32">
        <div className="col-span-12 lg:col-span-5">
          <h2 className="display text-[44px] leading-[1] text-aegis-paper sm:text-[56px] md:text-[72px] md:leading-[0.95] lg:text-[88px]">
            Give your agents
            <br />
            <em>shoulders</em> to
            <br />
            stand on.
          </h2>
          <p className="mt-7 max-w-[440px] text-base leading-relaxed text-aegis-mute">
            Two ways in. Free during open beta on both. Pick what fits — your operators can switch
            later without a migration.
          </p>
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-8 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-mute hover:text-aegis-signal"
          >
            Or browse the repo on GitHub first
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>
        <div className="col-span-12 grid grid-cols-1 gap-px bg-aegis-line lg:col-span-7 lg:grid-cols-2">
          <PathCard
            icon={Cloud}
            label="hosted"
            title="Use Nomos cloud."
            steps={[
              '1. Create a workspace',
              '2. Connect a SaaS or cloud',
              '3. Register your first App',
              '4. Drop the SDK into your agent',
            ]}
            ctaHref="/sign-up?intent=hosted"
            ctaLabel="Start free"
            primary
          />
          <PathCard
            icon={Server}
            label="self-host"
            title="Run it on your iron."
            steps={[
              '1. Join the waitlist',
              '2. Get the helm chart on flip',
              '3. Bring your own Ed25519 key',
              '4. Same SDK, same dashboard',
            ]}
            ctaHref="/sign-up?intent=self-host"
            ctaLabel="Join waitlist"
          />
        </div>
      </div>
    </section>
  );
}

function PathCard({
  icon: Icon,
  label,
  title,
  steps,
  ctaHref,
  ctaLabel,
  primary,
}: {
  icon: typeof Cloud;
  label: string;
  title: string;
  steps: string[];
  ctaHref: string;
  ctaLabel: string;
  primary?: boolean;
}) {
  return (
    <div className="bg-aegis-ink p-6 sm:p-8">
      <Icon className="h-6 w-6 text-aegis-signal" aria-hidden />
      <div className="eyebrow mt-5">{label}</div>
      <h3 className="display mt-2 text-[22px] leading-tight text-aegis-paper sm:text-[28px]">
        {title}
      </h3>
      <ol className="mt-6 space-y-2.5 font-mono text-sm text-aegis-paper">
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <Link
        href={ctaHref}
        className={`group mt-8 inline-flex items-center gap-2 rounded-sm px-5 py-3 font-mono text-[12px] uppercase tracking-[0.18em] transition-colors ${
          primary
            ? 'bg-aegis-signal text-aegis-ink hover:bg-aegis-signal/90'
            : 'border border-aegis-line text-aegis-paper hover:border-aegis-signal hover:text-aegis-signal'
        }`}
      >
        {ctaLabel}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}
