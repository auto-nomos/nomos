import { ArrowUpRight, Github, Package, Star } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicShell } from '../../components/nomos/public-shell';
import {
  GITHUB_CONTRIBUTING_URL,
  GITHUB_RELEASES_URL,
  GITHUB_REPO_URL,
  GITHUB_STAR_URL,
  NPM_ORG_URL,
} from '../../lib/community-links';

export const metadata: Metadata = {
  title: 'Open source — Nomos',
  description:
    'Nomos is going open source. 13 packages live on npm under @auto-nomos/* today; the control-plane and dashboard flip public alongside our 1.0 release under Apache-2.0. Star the repo to be in the first hundred.',
  alternates: { canonical: '/open-source' },
  openGraph: {
    title: 'Open source — Nomos',
    description:
      'Nomos is going open source. 13 packages on npm today. Control-plane source flips with 1.0.',
  },
};

const PACKAGES: { name: string; role: string; coverage?: string; status: 'public' | 'soon' }[] = [
  { name: '@auto-nomos/core', role: 'PDP decide() engine', coverage: '100%', status: 'public' },
  { name: '@auto-nomos/cedar', role: 'Cedar policy evaluator', coverage: '100%', status: 'public' },
  { name: '@auto-nomos/ucan', role: 'UCAN delegation chains', coverage: '100%', status: 'public' },
  { name: '@auto-nomos/crypto', role: 'DID + Ed25519 signing', status: 'public' },
  { name: '@auto-nomos/shared-types', role: 'Zod schemas', status: 'public' },
  { name: '@auto-nomos/sdk', role: 'TypeScript SDK', status: 'public' },
  { name: '@auto-nomos/mcp-server', role: 'MCP-protocol server', status: 'public' },
  { name: '@auto-nomos/adapters', role: 'YAML connector specs', status: 'public' },
  { name: '@auto-nomos/schema-packs', role: 'apiCall validators', status: 'public' },
  { name: '@auto-nomos/policy-builder', role: 'Visual editor (React Flow)', status: 'public' },
  { name: '@auto-nomos/audit-verify', role: 'Chain verify CLI', status: 'public' },
  { name: '@auto-nomos/cli', role: 'nomos CLI', status: 'public' },
  { name: '@auto-nomos/ucan-cli', role: 'nomos-ucan CLI', status: 'public' },
  { name: '@auto-nomos/control-plane', role: 'Hono + tRPC server', status: 'soon' },
  { name: '@auto-nomos/dashboard', role: 'Next.js operator UI', status: 'soon' },
];

const MILESTONES: { tag: string; date: string; body: string }[] = [
  {
    tag: 'v0.0.x → v0.1.x',
    date: 'May 2026',
    body: 'Foundation packages shipped under @auto-nomos/* on npm. PDP, Cedar, UCAN, crypto, SDK, MCP server, adapters, schema-packs all public.',
  },
  {
    tag: 'v0.2 (next)',
    date: 'Targeting Q3 2026',
    body: 'Self-host helm chart. Bring-your-own Ed25519 root signing key. First-party Docker images for control-plane + PDP.',
  },
  {
    tag: 'v1.0',
    date: 'Targeting Q4 2026',
    body: 'Control-plane + dashboard source open under Apache-2.0. CONTRIBUTING.md, RFC process, code of conduct, governance doc. Public roadmap on GitHub Projects.',
  },
];

export default function OpenSourcePage() {
  return (
    <PublicShell>
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-[1280px] px-6 pt-24 pb-20 md:px-10 md:pt-32">
          <div className="eyebrow flex items-center gap-3">
            <span className="pulse" />
            <span>Open source · roadmap to 1.0</span>
          </div>
          <h1 className="display mt-7 max-w-[18ch] text-[64px] text-aegis-paper md:text-[88px]">
            Going <em>open source</em>.
            <br />
            On purpose. In order.
          </h1>
          <p className="mt-8 max-w-[680px] text-lg leading-relaxed text-aegis-mute">
            We are publishing Nomos in layers. The crypto, the policy engine, the SDK, and the MCP
            server are already on npm — anyone can audit how a decision gets made. The control-plane
            and dashboard source go public with 1.0 under Apache-2.0. Until then, here is exactly
            what is open, what is coming, and when.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <a
              href={GITHUB_STAR_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-sm bg-aegis-signal px-5 py-3 font-mono text-[12px] uppercase tracking-[0.18em] text-aegis-ink"
            >
              <Star className="h-4 w-4" />
              Star on GitHub
            </a>
            <a
              href={GITHUB_RELEASES_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-sm border border-aegis-line px-5 py-3 font-mono text-[12px] uppercase tracking-[0.18em] text-aegis-paper"
            >
              Watch releases
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
            <a
              href={NPM_ORG_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-sm border border-aegis-line px-5 py-3 font-mono text-[12px] uppercase tracking-[0.18em] text-aegis-mute hover:text-aegis-paper"
            >
              <Package className="h-4 w-4" />
              View on npm
            </a>
          </div>
        </div>
        <div className="rule" />
      </section>

      <section className="mx-auto max-w-[1280px] px-6 py-24 md:px-10">
        <div className="grid grid-cols-12 gap-10">
          <div className="col-span-12 lg:col-span-4">
            <div className="eyebrow">what&rsquo;s public today</div>
            <h2 className="display mt-5 text-[44px] text-aegis-paper">13 packages on npm.</h2>
            <p className="mt-6 max-w-[420px] text-base leading-relaxed text-aegis-mute">
              Every cryptographic primitive, the policy evaluator, the capability mint, and the SDK
              that agents call. If a decision feels wrong, you can run the same engine offline and
              prove it.
            </p>
          </div>
          <div className="col-span-12 lg:col-span-8">
            <div className="corners relative rounded-sm border border-aegis-line bg-aegis-ink">
              <div className="grid grid-cols-12 border-b border-aegis-line px-6 py-4 font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
                <div className="col-span-5">package</div>
                <div className="col-span-5">role</div>
                <div className="col-span-2 text-right">status</div>
              </div>
              <ul className="divide-y divide-aegis-line">
                {PACKAGES.map((p) => (
                  <li key={p.name} className="grid grid-cols-12 items-center gap-3 px-6 py-3">
                    <div className="col-span-5 font-mono text-[12px] text-aegis-paper">
                      {p.name}
                    </div>
                    <div className="col-span-5 text-xs text-aegis-mute">
                      {p.role}
                      {p.coverage ? (
                        <span className="ml-2 font-mono text-[10px] text-aegis-signal">
                          {p.coverage} cov
                        </span>
                      ) : null}
                    </div>
                    <div className="col-span-2 text-right">
                      <span
                        className={`inline-flex items-center rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] ${
                          p.status === 'public'
                            ? 'border-aegis-signal/40 bg-aegis-signal/10 text-aegis-signal'
                            : 'border-aegis-amber/40 bg-aegis-amber/10 text-aegis-amber'
                        }`}
                      >
                        {p.status === 'public' ? 'on npm' : 'soon'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-aegis-line bg-aegis-surface/30">
        <div className="mx-auto max-w-[1280px] px-6 py-24 md:px-10">
          <div className="grid grid-cols-12 gap-10">
            <div className="col-span-12 lg:col-span-4">
              <div className="eyebrow">roadmap</div>
              <h2 className="display mt-5 text-[44px] text-aegis-paper">
                Three milestones.
                <br />
                <em>One Apache-2.0 flip.</em>
              </h2>
            </div>
            <div className="col-span-12 lg:col-span-8">
              <ol className="divide-y divide-aegis-line border-y border-aegis-line">
                {MILESTONES.map((m) => (
                  <li key={m.tag} className="grid grid-cols-12 items-start gap-5 py-10">
                    <div className="col-span-3">
                      <div className="font-display text-[24px] text-aegis-signal">{m.tag}</div>
                      <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-faint">
                        {m.date}
                      </div>
                    </div>
                    <div className="col-span-9">
                      <p className="text-sm leading-relaxed text-aegis-paper">{m.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-6 py-24 md:px-10">
        <div className="grid grid-cols-12 gap-10">
          <div className="col-span-12 lg:col-span-5">
            <div className="eyebrow">why wait</div>
            <h2 className="display mt-5 text-[44px] text-aegis-paper">Why not flip today?</h2>
          </div>
          <div className="col-span-12 lg:col-span-7 space-y-6 text-base leading-relaxed text-aegis-mute">
            <p>
              Three reasons. The control-plane still carries a few customer-specific feature flags
              we&rsquo;d rather extract before public review. The audit-root signing flow needs the
              bring-your-own-key path before self-hosters can run it without trusting us. And the
              first sweep of a public repo&rsquo;s CONTRIBUTING is something we want to do once, not
              twice.
            </p>
            <p>
              We&rsquo;re moving fast. The npm-published packages are battle-tested in production
              today — those are the parts most worth reading first. When the rest flips,
              you&rsquo;ll already know the engine that drives it.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-sm border border-aegis-line px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-paper hover:border-aegis-signal hover:text-aegis-signal"
              >
                <Github className="h-4 w-4" />
                Org on GitHub
              </a>
              <a
                href={GITHUB_CONTRIBUTING_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-sm border border-aegis-line px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-mute hover:text-aegis-paper"
              >
                Read CONTRIBUTING
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
              <Link
                href="/community"
                className="inline-flex items-center gap-2 rounded-sm px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-mute hover:text-aegis-paper"
              >
                Talk to us
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
