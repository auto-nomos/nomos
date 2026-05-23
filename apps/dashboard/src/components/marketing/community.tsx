import { ArrowUpRight, MessageCircle, MessagesSquare, Users } from 'lucide-react';
import {
  DISCORD_INVITE_URL,
  GITHUB_CONTRIBUTING_URL,
  GITHUB_DISCUSSIONS_URL,
} from '../../lib/community-links';

/**
 * Band 10 — Community. One idea: build with us. Three cards: Discord,
 * GitHub Discussions, Contributors. Contributors tile is a placeholder
 * until we have a real wall — but it links somewhere actionable.
 */
export function Community() {
  return (
    <section className="mx-auto max-w-[1280px] px-6 py-32 md:px-10">
      <div className="grid grid-cols-12 gap-10">
        <div className="col-span-12 lg:col-span-4">
          <div className="eyebrow flex items-center gap-3">
            <Users className="h-4 w-4 text-aegis-signal" aria-hidden />
            community
          </div>
          <h2 className="display mt-5 text-[56px] leading-[1.02] text-aegis-paper">
            Build <em>with</em> us.
          </h2>
          <p className="mt-6 max-w-[420px] text-base leading-relaxed text-aegis-mute">
            Authorization for agents is a new category. We&rsquo;d rather invent it in public with
            you than ship it from a closed room. Three doors in.
          </p>
        </div>
        <div className="col-span-12 lg:col-span-8">
          <div className="grid grid-cols-1 gap-px bg-aegis-line md:grid-cols-3">
            <Card
              href={DISCORD_INVITE_URL}
              external
              icon={MessageCircle}
              label="discord"
              title="Real-time chat"
              body="Office hours every Friday. Policy debugging, integration requests, weird-edge-case stories."
              cta="Join the server"
            />
            <Card
              href={GITHUB_DISCUSSIONS_URL}
              external
              icon={MessagesSquare}
              label="discussions"
              title="RFC-style proposals"
              body="Where new integrations, schema changes, and policy primitives get argued before they ship."
              cta="Open Discussions"
            />
            <Card
              href={GITHUB_CONTRIBUTING_URL}
              external
              icon={Users}
              label="contributors"
              title="Send a PR"
              body="Adapters are YAML. Schema packs are TypeScript. The bar to first commit is one file. Be commit #001."
              cta="Read CONTRIBUTING.md"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function Card({
  href,
  external,
  icon: Icon,
  label,
  title,
  body,
  cta,
}: {
  href: string;
  external?: boolean;
  icon: typeof Users;
  label: string;
  title: string;
  body: string;
  cta: string;
}) {
  const linkProps = external ? { target: '_blank', rel: 'noreferrer' as const } : {};
  return (
    <a
      href={href}
      {...linkProps}
      className="group flex flex-col bg-aegis-ink p-8 transition-colors hover:bg-aegis-surface/60"
    >
      <Icon className="h-6 w-6 text-aegis-signal" aria-hidden />
      <div className="eyebrow mt-5">{label}</div>
      <h3 className="display mt-2 text-[24px] leading-tight text-aegis-paper">{title}</h3>
      <p className="mt-3 flex-1 text-sm leading-relaxed text-aegis-mute">{body}</p>
      <span className="mt-6 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-mute group-hover:text-aegis-signal">
        {cta}
        <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </span>
    </a>
  );
}
