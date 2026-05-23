import { ArrowRight, BookOpen, Layers } from 'lucide-react';
import Link from 'next/link';

export function Bottom() {
  return (
    <section>
      <div className="mx-auto max-w-[1280px] px-6 py-24 md:px-10 md:py-32">
        <div className="mb-12 text-center">
          <div className="eyebrow inline-flex items-center gap-3">
            <span className="pulse" />
            <span>you're live</span>
          </div>
          <h2 className="display mt-5 text-[44px] leading-tight text-aegis-paper md:text-[64px]">
            Ship the agent.
            <br />
            Watch <em>every call</em>.
          </h2>
          <p className="mx-auto mt-6 max-w-[560px] text-[15px] leading-relaxed text-aegis-mute md:text-base">
            Same flow for every integration in the catalog — Slack, Stripe, Notion, Google, AWS,
            Azure, GCP, filesystem, SSH, Postgres, and twenty more.
          </p>
        </div>
        <div className="grid gap-px overflow-hidden rounded-sm border border-aegis-line bg-aegis-line md:grid-cols-3">
          <Link
            href="/sign-up"
            className="group flex flex-col gap-3 bg-aegis-ink p-8 transition-colors hover:bg-aegis-surface/40"
          >
            <div className="eyebrow text-aegis-signal">create account</div>
            <div className="font-display text-[24px] text-aegis-paper">Start free, no card →</div>
            <div className="text-[13px] leading-relaxed text-aegis-mute">
              1,000 decisions / month on the hosted free tier. Upgrade only when you outgrow it.
            </div>
            <ArrowRight className="mt-auto h-4 w-4 text-aegis-signal transition-transform group-hover:translate-x-1" />
          </Link>
          <Link
            href="/docs/get-started/quickstart"
            className="group flex flex-col gap-3 bg-aegis-ink p-8 transition-colors hover:bg-aegis-surface/40"
          >
            <div className="eyebrow text-aegis-signal">deep dive</div>
            <div className="font-display text-[24px] text-aegis-paper">
              Read the quickstart doc →
            </div>
            <div className="text-[13px] leading-relaxed text-aegis-mute">
              Same four steps, written long-form, with copy-paste blocks for each path.
              Bookmark-friendly.
            </div>
            <BookOpen className="mt-auto h-4 w-4 text-aegis-signal" />
          </Link>
          <Link
            href="/integrations"
            className="group flex flex-col gap-3 bg-aegis-ink p-8 transition-colors hover:bg-aegis-surface/40"
          >
            <div className="eyebrow text-aegis-signal">catalog</div>
            <div className="font-display text-[24px] text-aegis-paper">
              Browse all integrations →
            </div>
            <div className="text-[13px] leading-relaxed text-aegis-mute">
              27 providers across SaaS, messaging, productivity, cloud IAM, data, system, and AI.
            </div>
            <Layers className="mt-auto h-4 w-4 text-aegis-signal" />
          </Link>
        </div>
      </div>
    </section>
  );
}
