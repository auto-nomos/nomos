import { ArrowUpRight, Calendar, Github, MessageCircle, MessagesSquare, Users } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicShell } from '../../components/nomos/public-shell';
import {
  DISCORD_INVITE_URL,
  GITHUB_CONTRIBUTING_URL,
  GITHUB_DISCUSSIONS_URL,
  GITHUB_REPO_URL,
} from '../../lib/community-links';

export const metadata: Metadata = {
  title: 'Community — Nomos',
  description:
    'Build with us. Discord for real-time chat and Friday office hours. GitHub Discussions for RFC-style proposals. Contributor wall for the first hundred PRs.',
  alternates: { canonical: '/community' },
  openGraph: {
    title: 'Community — Nomos',
    description:
      'Discord, GitHub Discussions, and contributor wall for the open-source authorization layer for AI agents.',
  },
};

export default function CommunityPage() {
  return (
    <PublicShell>
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-[1280px] px-6 pt-24 pb-20 md:px-10 md:pt-32">
          <div className="eyebrow flex items-center gap-3">
            <span className="pulse" />
            <span>Community · open doors</span>
          </div>
          <h1 className="display mt-7 max-w-[16ch] text-[64px] text-aegis-paper md:text-[88px]">
            Build <em>with</em> us.
          </h1>
          <p className="mt-8 max-w-[680px] text-lg leading-relaxed text-aegis-mute">
            Authorization for agents is a new category. We&rsquo;d rather invent it in public with
            you than ship it from a closed room. Three doors in. Walk through any of them.
          </p>
        </div>
        <div className="rule" />
      </section>

      <section id="discord" className="mx-auto max-w-[1280px] px-6 py-24 md:px-10">
        <div className="grid grid-cols-12 gap-10">
          <div className="col-span-12 lg:col-span-5">
            <div className="eyebrow flex items-center gap-3">
              <MessageCircle className="h-4 w-4 text-aegis-signal" aria-hidden />
              discord
            </div>
            <h2 className="display mt-5 text-[44px] text-aegis-paper">
              Real-time chat.
              <br />
              <em>Office hours</em> every Friday.
            </h2>
            <p className="mt-6 max-w-[460px] text-base leading-relaxed text-aegis-mute">
              The fastest path to an answer. Policy debugging, integration requests, weird-edge-case
              stories. The maintainers live in there.
            </p>
            <a
              href={DISCORD_INVITE_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-8 inline-flex items-center gap-2 rounded-sm bg-aegis-signal px-5 py-3 font-mono text-[12px] uppercase tracking-[0.18em] text-aegis-ink"
            >
              <MessageCircle className="h-4 w-4" />
              Join the server
            </a>
          </div>
          <div className="col-span-12 lg:col-span-7">
            <div className="corners relative rounded-sm border border-aegis-line bg-aegis-ink p-8">
              <div className="eyebrow mb-5">channels</div>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  ['#welcome', 'Say hi, drop your stack'],
                  ['#help', 'Stuck on a policy or PDP error'],
                  ['#integrations', 'Request adapters, share configs'],
                  ['#self-host', 'Helm chart, k8s, BYOK'],
                  ['#rfc', 'Proposal discussion before GH'],
                  ['#showcase', 'What you built on top of Nomos'],
                ].map(([name, body]) => (
                  <li
                    key={name}
                    className="rounded-sm border border-aegis-line bg-aegis-surface/40 px-4 py-3"
                  >
                    <div className="font-mono text-[12px] text-aegis-signal">{name}</div>
                    <div className="mt-1 text-xs text-aegis-mute">{body}</div>
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex items-center gap-3 border-t border-aegis-line pt-5">
                <Calendar className="h-4 w-4 text-aegis-signal" aria-hidden />
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-mute">
                  Office hours · Fri 10am PT · voice + screen-share
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="discussions" className="border-y border-aegis-line bg-aegis-surface/30">
        <div className="mx-auto max-w-[1280px] px-6 py-24 md:px-10">
          <div className="grid grid-cols-12 gap-10">
            <div className="col-span-12 lg:col-span-5">
              <div className="eyebrow flex items-center gap-3">
                <MessagesSquare className="h-4 w-4 text-aegis-signal" aria-hidden />
                discussions
              </div>
              <h2 className="display mt-5 text-[44px] text-aegis-paper">
                RFC-style <em>proposals</em>.
              </h2>
              <p className="mt-6 max-w-[460px] text-base leading-relaxed text-aegis-mute">
                Where new integrations, schema changes, and policy primitives get argued before they
                ship. If you want to influence the shape of the platform, this is the room.
              </p>
              <a
                href={GITHUB_DISCUSSIONS_URL}
                target="_blank"
                rel="noreferrer"
                className="mt-8 inline-flex items-center gap-2 rounded-sm border border-aegis-line px-5 py-3 font-mono text-[12px] uppercase tracking-[0.18em] text-aegis-paper hover:border-aegis-signal hover:text-aegis-signal"
              >
                Open Discussions
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>
            <div className="col-span-12 lg:col-span-7">
              <ul className="grid grid-cols-1 gap-px bg-aegis-line">
                {[
                  ['RFC', 'Adding a new connector adapter (YAML format spec)'],
                  ['Question', 'How to constrain SSH commands by regex on the resource'],
                  ['Proposal', 'Policy templating for multi-tenant SaaS'],
                  ['Discussion', 'Bring-your-own-Ed25519-key for audit roots'],
                ].map(([kind, title]) => (
                  <li key={title} className="bg-aegis-ink px-6 py-4">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center rounded-sm border border-aegis-line bg-aegis-surface px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-mute">
                        {kind}
                      </span>
                      <span className="text-sm text-aegis-paper">{title}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section id="contributors" className="mx-auto max-w-[1280px] px-6 py-24 md:px-10">
        <div className="grid grid-cols-12 gap-10">
          <div className="col-span-12 lg:col-span-5">
            <div className="eyebrow flex items-center gap-3">
              <Users className="h-4 w-4 text-aegis-signal" aria-hidden />
              contributors
            </div>
            <h2 className="display mt-5 text-[44px] text-aegis-paper">
              The bar to first commit
              <br />
              is <em>one file</em>.
            </h2>
            <p className="mt-6 max-w-[460px] text-base leading-relaxed text-aegis-mute">
              Adapters are YAML. Schema packs are TypeScript. Policy templates are Cedar. Pick the
              one that fits your skill, send a PR, be commit #001. Swag drop and contributor wall
              spot when the repo flips.
            </p>
            <a
              href={GITHUB_CONTRIBUTING_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-8 inline-flex items-center gap-2 rounded-sm border border-aegis-line px-5 py-3 font-mono text-[12px] uppercase tracking-[0.18em] text-aegis-paper hover:border-aegis-signal hover:text-aegis-signal"
            >
              <Github className="h-4 w-4" />
              Read CONTRIBUTING.md
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
          <div className="col-span-12 lg:col-span-7">
            <div className="corners relative rounded-sm border border-aegis-line bg-aegis-ink p-8">
              <div className="eyebrow mb-5">first commits — slots open</div>
              <div className="grid grid-cols-5 gap-3 sm:grid-cols-8 lg:grid-cols-10">
                {Array.from({ length: 30 }).map((_, i) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder grid
                    key={i}
                    className="aspect-square rounded-sm border border-dashed border-aegis-line bg-aegis-surface/30 transition-colors hover:border-aegis-signal/40"
                  />
                ))}
              </div>
              <div className="mt-6 flex items-center justify-between border-t border-aegis-line pt-5">
                <a
                  href={GITHUB_REPO_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-signal hover:text-aegis-paper"
                >
                  Browse good-first-issues
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
                <Link
                  href="/open-source"
                  className="font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-mute hover:text-aegis-paper"
                >
                  full OSS roadmap →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
