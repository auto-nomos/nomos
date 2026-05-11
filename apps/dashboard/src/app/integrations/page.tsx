import { ArrowUpRight, CircleDashed, Plug } from 'lucide-react';
import Link from 'next/link';
import { PublicShell } from '../../components/nomos/public-shell';

/* Public integrations matrix. Lists every connector + non-OAuth provider
   currently shipping, plus a roadmap row. Pulled from the in-product
   schema-packs registry conceptually but typed by hand here so the
   marketing surface doesn't depend on app code at build time. */

export const metadata = {
  title: 'Integrations · Nomos',
  description:
    'Every supported SaaS, every action, every policy template. Browse what Nomos can authorize on your behalf.',
};

interface Integration {
  id: string;
  name: string;
  category: 'OAuth' | 'Provider';
  scopes: string;
  templates: number;
  state: 'live' | 'beta' | 'soon';
  blurb: string;
}

const INTEGRATIONS: Integration[] = [
  {
    id: 'github',
    name: 'GitHub',
    category: 'OAuth',
    scopes: 'repo, read:org, write:issues',
    templates: 5,
    state: 'live',
    blurb: 'Issues, PRs, repo metadata, branch protection.',
  },
  {
    id: 'slack',
    name: 'Slack',
    category: 'OAuth',
    scopes: 'chat:write, channels:read',
    templates: 5,
    state: 'live',
    blurb: 'Channel messages, threads, user lookups.',
  },
  {
    id: 'google',
    name: 'Google',
    category: 'OAuth',
    scopes: 'drive.file, calendar',
    templates: 10,
    state: 'live',
    blurb: 'Drive (files, sheets) and Calendar (events).',
  },
  {
    id: 'notion',
    name: 'Notion',
    category: 'OAuth',
    scopes: 'pages, databases',
    templates: 5,
    state: 'live',
    blurb: 'Read/write pages and database rows.',
  },
  {
    id: 'linear',
    name: 'Linear',
    category: 'OAuth',
    scopes: 'read, issues:create',
    templates: 5,
    state: 'live',
    blurb: 'Issues, projects, comments via GraphQL.',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    category: 'OAuth',
    scopes: 'read_only (Connect)',
    templates: 5,
    state: 'live',
    blurb: 'Customers, charges, invoices. Refunds gated by step-up.',
  },
  {
    id: 'filesystem',
    name: 'Filesystem',
    category: 'Provider',
    scopes: 'path-scoped read/write',
    templates: 5,
    state: 'live',
    blurb: 'Local + sandboxed FS access for dynamic agents.',
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    category: 'OAuth',
    scopes: 'api, refresh_token',
    templates: 0,
    state: 'soon',
    blurb: 'Accounts, opportunities, custom objects.',
  },
  {
    id: 'jira',
    name: 'Jira',
    category: 'OAuth',
    scopes: 'read:jira-work',
    templates: 0,
    state: 'soon',
    blurb: 'Issues, sprints, projects.',
  },
];

export default function IntegrationsPage() {
  return (
    <PublicShell>
      <Hero />
      <Matrix />
      <Adapter />
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
            <span>
              integrations · live count {INTEGRATIONS.filter((i) => i.state === 'live').length}
            </span>
          </div>
          <h1 className="display mt-7 max-w-[14ch] text-[64px] leading-[0.95] text-aegis-paper md:text-[88px]">
            Every connector,
            <br />
            every <em>action</em>.
          </h1>
          <p className="mt-7 max-w-[640px] text-base leading-relaxed text-aegis-mute md:text-lg">
            Nomos ships pre-flighted policy templates for each supported SaaS so you can grant
            least-scope access without writing a single line of Cedar. Need a connector that
            isn&rsquo;t here yet? The adapter contract is six functions.
          </p>
        </div>
        <aside className="hidden lg:col-span-4 lg:block">
          <div className="corners relative rounded-sm border border-aegis-line bg-aegis-surface/40 p-7">
            <div className="eyebrow">stats · live</div>
            <dl className="mt-5 space-y-4 font-mono">
              <Stat
                label="connectors"
                value={INTEGRATIONS.filter((i) => i.state === 'live').length.toString()}
              />
              <Stat
                label="templates"
                value={INTEGRATIONS.reduce((a, b) => a + b.templates, 0).toString()}
              />
              <Stat label="categories" value="2" />
              <Stat label="adapter loc" value="< 200" />
            </dl>
          </div>
        </aside>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-end justify-between border-b border-aegis-line/60 pb-3">
      <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
        {label}
      </dt>
      <dd className="font-display text-[28px] leading-none text-aegis-paper">{value}</dd>
    </div>
  );
}

function Matrix() {
  return (
    <section className="mx-auto max-w-[1280px] px-6 py-24 md:px-10">
      <div className="mb-10 flex items-baseline justify-between">
        <div>
          <div className="eyebrow">matrix</div>
          <h2 className="display mt-3 text-[40px] text-aegis-paper">
            What Nomos can authorize today.
          </h2>
        </div>
      </div>
      <div className="overflow-hidden rounded-sm border border-aegis-line">
        <div className="grid grid-cols-12 gap-3 border-b border-aegis-line bg-aegis-ink/60 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
          <div className="col-span-3">provider</div>
          <div className="col-span-2">category</div>
          <div className="col-span-3">scopes</div>
          <div className="col-span-2">templates</div>
          <div className="col-span-2 text-right">status</div>
        </div>
        <ul className="divide-y divide-aegis-line">
          {INTEGRATIONS.map((it) => (
            <li
              key={it.id}
              className="grid grid-cols-12 items-center gap-3 px-5 py-5 transition-colors hover:bg-aegis-surface/40"
            >
              <div className="col-span-3 flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-sm border border-aegis-line bg-aegis-surface font-mono text-[11px] text-aegis-paper">
                  {it.name.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <div className="font-display text-[18px] text-aegis-paper">{it.name}</div>
                  <div className="text-xs text-aegis-mute">{it.blurb}</div>
                </div>
              </div>
              <div className="col-span-2 font-mono text-[11px] uppercase tracking-[0.16em] text-aegis-mute">
                {it.category}
              </div>
              <div className="col-span-3 font-mono text-[11px] text-aegis-mute">{it.scopes}</div>
              <div className="col-span-2 font-mono text-[12px] text-aegis-paper">
                {it.templates > 0 ? `${it.templates} ready` : '—'}
              </div>
              <div className="col-span-2 text-right">
                <StateBadge state={it.state} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function StateBadge({ state }: { state: Integration['state'] }) {
  if (state === 'live') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-sm border border-aegis-signal/40 bg-aegis-signal/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-aegis-signal">
        <span className="pulse" /> live
      </span>
    );
  }
  if (state === 'beta') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-sm border border-aegis-amber/40 bg-aegis-amber/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-aegis-amber">
        beta
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border border-aegis-line px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-aegis-mute">
      <CircleDashed className="h-3 w-3" />
      soon
    </span>
  );
}

function Adapter() {
  return (
    <section className="border-t border-aegis-line bg-aegis-surface/30">
      <div className="mx-auto grid max-w-[1280px] grid-cols-12 gap-10 px-6 py-24 md:px-10 md:py-32">
        <div className="col-span-12 lg:col-span-6">
          <div className="eyebrow">build your own</div>
          <h2 className="display mt-4 text-[44px] leading-tight text-aegis-paper">
            Adapter contract,
            <br />
            <em>six functions</em>.
          </h2>
          <p className="mt-5 max-w-[520px] text-sm leading-relaxed text-aegis-mute">
            Adding a connector means implementing the OAuth dance and four tiny callbacks. Nomos
            handles the policy, the audit, the step-up, and the refresh sweep. You bring the API.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/docs#sdk"
              className="inline-flex items-center gap-2 rounded-sm border border-aegis-line px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-paper transition-colors hover:border-aegis-line-strong"
            >
              <Plug className="h-3.5 w-3.5" />
              read SDK reference
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 rounded-sm bg-aegis-signal px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-ink transition-colors hover:bg-aegis-signal/90"
            >
              build with us →
            </Link>
          </div>
        </div>
        <div className="col-span-12 lg:col-span-6">
          <pre className="overflow-x-auto rounded-sm border border-aegis-line bg-aegis-ink p-6 font-mono text-[12.5px] leading-[1.7] text-aegis-paper">
            {`export interface Connector {
  id: ConnectorId;                  // 'jira'
  defaultScopes: string[];          // ['read:jira-work']

  authUrl(args: AuthArgs): string;
  exchangeCode(code: string): Promise<TokenSet>;
  refresh(token: string): Promise<TokenSet>;
  callApi(req: ProxiedRequest): Promise<UpstreamResponse>;
}`}
          </pre>
        </div>
      </div>
    </section>
  );
}
