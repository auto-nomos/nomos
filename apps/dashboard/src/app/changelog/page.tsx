import { ArrowUpRight, GitCommit } from 'lucide-react';
import Link from 'next/link';
import { PublicShell } from '../../components/nomos/public-shell';

/* Public changelog. Each entry is an editorial note — terse but
   meaningful. Tags are chartreuse for features, amber for hardening,
   iris for infra. Newest first. */

interface Entry {
  date: string;
  version: string;
  title: string;
  tag: 'feat' | 'fix' | 'infra';
  body: string;
  bullets: string[];
}

const ENTRIES: Entry[] = [
  {
    date: '2026-05-11',
    version: 'v0.2.0-beta.2',
    title: 'Nomos brand · public docs · dark canvas everywhere.',
    tag: 'feat',
    body: 'The platform now ships under the Nomos brand: dark-first, editorial typography, and a comprehensive public docs surface. Marketing pages, sign-in / sign-up, and onboarding all redrawn from the ground up.',
    bullets: [
      'New marketing home page with live decision panel',
      'Public /docs (mirrors in-product user guide)',
      'Public /security trust posture statement',
      'Public /integrations matrix + adapter contract',
      'Public /changelog (this page)',
      'Sign-in / sign-up split-pane with brand panel',
      'Onboarding wizard re-styled with Nomos tokens',
    ],
  },
  {
    date: '2026-05-11',
    version: 'v0.2.0-beta.1',
    title: 'Clawvisor parity · LLM intent verifier · standing grants.',
    tag: 'feat',
    body: 'Closes the five-item parity gap with Clawvisor (YC W26). New surfaces: per-request LLM coherence verification (fail-closed), PDP response sanitizer, three new connectors (Linear, Stripe, Calendar), Telegram notification channel, durable standing-grant model.',
    bullets: [
      'LLM intent verifier (Claude Haiku 4.5, 1.5s timeout, fail-closed)',
      'PDP response sanitizer middleware (secrets, HTML, zero-width)',
      'Linear + Stripe OAuth connectors',
      'Google Calendar scope expansion (5 templates)',
      'Telegram notification channel via Knock',
      'isStanding flag + nullable expiresAt on envelopes',
      'Standing grants overview page in dashboard',
    ],
  },
  {
    date: '2026-05-10',
    version: 'v0.1.0',
    title: 'First win — Claude Desktop e2e green.',
    tag: 'feat',
    body: 'Claude Desktop end-to-end demo passes green. Approval Envelope + UCAN resource_constraint + /v1/intent + filesystem proxy + mcp-filesystem demo all live. Hardening pass on top: zod bump, schema seed, connections UI, audit polish, edge PDP packaging.',
    bullets: [
      'Dynamic-scope filesystem slice landed',
      'mcp-filesystem demo green',
      'Customer-edge PDP Docker + Helm chart',
      'Audit panel polish + proof bundle download',
    ],
  },
  {
    date: '2026-05-09',
    version: 'v0.0.9',
    title: 'Sprint 9 · step-up + WebAuthn passkey + cosigner UCAN.',
    tag: 'feat',
    body: 'Two-pass cedar detection escalates risky calls to step-up. Passkey assertion in the browser → cosigner UCAN minted on the control plane → PDP three-layer validation. Knock dev-console fallback when KNOCK_API_KEY is empty.',
    bullets: [
      'WebAuthn passkey enrollment + assertion',
      'Cosigner UCAN minting + validation',
      'PDP three-layer cosigner validation',
      'Knock workflow integration',
    ],
  },
  {
    date: '2026-05-09',
    version: 'v0.0.8',
    title: 'Sprint 8 · push revocation + Postgres audit hash chain.',
    tag: 'infra',
    body: 'Audit chain moved to Postgres with hash-chained rows. Daily Ed25519 signed roots stored in audit_roots. Revocation pushes via Server-Sent Events. R2 Parquet archive with 7-year lifecycle. Open-source audit-verify CLI.',
    bullets: [
      'Hash-chained audit_events',
      'Ed25519 signed daily roots (env-managed)',
      'audit-verify CLI',
      'Cloudflare R2 Parquet archive',
    ],
  },
  {
    date: '2026-05-09',
    version: 'v0.0.7',
    title: 'Sprint 7 · visual policy builder + 20 templates.',
    tag: 'feat',
    body: 'packages/policy-builder: IR / parse / emit / round-trip. Schema-packs: 20 starter templates across the four foundation connectors. Dashboard ships a Visual tab on the Policies page.',
    bullets: [
      'Cedar IR + visual builder',
      'roundTrip() validation rule before save',
      '20 starter templates',
    ],
  },
  {
    date: '2026-05-09',
    version: 'v0.0.6',
    title: 'Sprint 6 · dashboard MVP shipped.',
    tag: 'feat',
    body: 'Next.js 15 + tRPC + Better-Auth + Monaco editor + audit viewer. First end-to-end usable surface for the platform.',
    bullets: [
      'Next.js 15 App Router',
      'tRPC + Better-Auth integration',
      'Monaco-backed Cedar editor',
      'Audit viewer + chain inspector',
      'api-keys router',
    ],
  },
  {
    date: '2026-05-09',
    version: 'v0.0.5',
    title: 'Sprint 5 · OAuth ↔ UCAN bridge + 24h refresh sweep.',
    tag: 'infra',
    body: 'Four connectors live (GitHub, Slack, Google, Notion). Proxy mode swaps UCAN for OAuth bearer at the moment of the upstream call. On-demand refresh on 401 + 1-hour sweep with 24-hour lookahead.',
    bullets: ['4 OAuth connectors', 'Proxy mode', 'Refresh sweep (1h cadence, 24h lookahead)'],
  },
];

export const metadata = {
  title: 'Changelog · Nomos',
  description: 'Releases, hardening passes, infrastructure changes — newest first.',
};

export default function ChangelogPage() {
  return (
    <PublicShell>
      <Hero />
      <Stream />
    </PublicShell>
  );
}

function Hero() {
  return (
    <section className="border-b border-aegis-line">
      <div className="mx-auto grid max-w-[1280px] grid-cols-12 gap-10 px-6 py-24 md:px-10 md:py-32">
        <div className="col-span-12 lg:col-span-8" data-stagger>
          <div className="eyebrow flex items-center gap-3">
            <span className="pulse" />
            <span>changelog · {ENTRIES.length} entries</span>
          </div>
          <h1 className="display mt-7 max-w-[14ch] text-[64px] leading-[0.95] text-aegis-paper md:text-[88px]">
            Every
            <br />
            <em>release</em>, with reasons.
          </h1>
          <p className="mt-7 max-w-[640px] text-base leading-relaxed text-aegis-mute md:text-lg">
            We ship in sprints. Each entry below is a real release — features we shipped, hardening
            passes, infrastructure changes. No marketing spin. If we removed something, you&rsquo;ll
            read about that too.
          </p>
        </div>
        <aside className="hidden lg:col-span-4 lg:block">
          <div className="corners relative rounded-sm border border-aegis-line bg-aegis-surface/40 p-7">
            <div className="eyebrow">subscribe</div>
            <p className="mt-4 text-sm text-aegis-mute">
              Drop your email — we&rsquo;ll send a digest when we ship.
            </p>
            <form
              className="mt-5 flex gap-2"
              action="https://formspree.io/aegis-changelog"
              method="post"
            >
              <input
                type="email"
                name="email"
                required
                placeholder="ada@acme.com"
                className="flex-1 rounded-sm border border-aegis-line bg-aegis-ink px-3 py-2 text-sm text-aegis-paper placeholder:text-aegis-faint focus:border-aegis-signal focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-sm bg-aegis-signal px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-ink transition-colors hover:bg-aegis-signal/90"
              >
                subscribe
              </button>
            </form>
            <Link
              href="/docs"
              className="mt-6 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-mute hover:text-aegis-paper"
            >
              read the docs
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </aside>
      </div>
    </section>
  );
}

function Stream() {
  return (
    <section className="mx-auto max-w-[1280px] px-6 py-24 md:px-10">
      <ol className="relative border-l border-aegis-line">
        {ENTRIES.map((e, i) => (
          <li key={e.version} className="relative pb-16 pl-10 last:pb-0">
            <span className="absolute -left-[7px] top-0 grid h-3.5 w-3.5 place-items-center rounded-full bg-aegis-ink ring-1 ring-aegis-line">
              <span className="h-1.5 w-1.5 rounded-full bg-aegis-signal" />
            </span>
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-faint">
                {e.date}
              </span>
              <TagBadge tag={e.tag} />
              <span className="font-mono text-[11px] text-aegis-mute">{e.version}</span>
            </div>
            <h2 className="display mt-4 text-[36px] leading-tight text-aegis-paper">{e.title}</h2>
            <p className="mt-4 max-w-[680px] text-sm leading-relaxed text-aegis-mute">{e.body}</p>
            <ul className="mt-6 grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2">
              {e.bullets.map((b) => (
                <li key={b} className="flex items-start gap-2.5 text-[14px] text-aegis-paper/90">
                  <GitCommit className="mt-1 h-3.5 w-3.5 shrink-0 text-aegis-signal" />
                  {b}
                </li>
              ))}
            </ul>
            {i === 0 ? null : (
              <div className="mt-8 h-px bg-gradient-to-r from-transparent via-aegis-line to-transparent" />
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function TagBadge({ tag }: { tag: Entry['tag'] }) {
  const tones = {
    feat: 'border-aegis-signal/40 bg-aegis-signal/10 text-aegis-signal',
    fix: 'border-aegis-amber/40 bg-aegis-amber/10 text-aegis-amber',
    infra: 'border-aegis-iris/40 bg-aegis-iris/10 text-aegis-iris',
  };
  return (
    <span
      className={`rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] ${tones[tag]}`}
    >
      {tag}
    </span>
  );
}
