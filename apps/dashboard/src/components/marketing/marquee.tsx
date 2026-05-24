/**
 * Band 2 — Marquee proof. One idea: 24 integrations, 283 actions, one policy
 * engine. Four KPIs in a row, then a scrolling list of provider names.
 */
const KPIS: { kpi: string; label: string; sub: string }[] = [
  { kpi: '24', label: 'integrations', sub: 'SaaS · cloud · infra' },
  { kpi: '283', label: 'brokered actions', sub: 'schema-validated' },
  { kpi: '<50ms', label: 'p99 decision', sub: 'in-region PDP' },
  { kpi: '13', label: 'npm packages', sub: '@auto-nomos/*' },
];

const PROVIDERS = [
  'GitHub',
  'Slack',
  'Stripe',
  'Linear',
  'Notion',
  'Google Drive',
  'Gmail',
  'Calendar',
  'Sheets',
  'Docs',
  'Tasks',
  'Contacts',
  'AWS',
  'Azure',
  'GCP',
  'Postgres',
  'SSH',
  'Filesystem',
  'Discord',
  'Telegram',
  'Twilio',
  'Dropbox',
  'Jira',
  'Salesforce',
];

export function Marquee() {
  return (
    <section className="border-y border-aegis-line bg-aegis-surface/40">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 md:px-10">
        <div className="grid grid-cols-2 divide-aegis-line md:grid-cols-4 md:divide-x">
          {KPIS.map((it, i) => (
            <div
              key={it.label}
              className={`px-2 py-7 ${i < 2 ? 'border-b border-aegis-line md:border-b-0' : ''}`}
            >
              <div className="font-display text-[32px] leading-none text-aegis-paper sm:text-[44px]">
                {it.kpi}
              </div>
              <div className="eyebrow mt-3">{it.label}</div>
              <div className="mt-1 text-xs text-aegis-mute">{it.sub}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="overflow-hidden border-t border-aegis-line py-6">
        <div className="marquee">
          {[...PROVIDERS, ...PROVIDERS].map((label, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: static doubled list for infinite-scroll marquee; order never changes
              key={`${label}-${i}`}
              className="flex shrink-0 items-center gap-3 border-l border-aegis-line px-8 py-2 first:border-l-0"
            >
              <span className="grid h-6 w-6 place-items-center rounded-sm border border-aegis-line bg-aegis-surface font-mono text-[10px] text-aegis-paper">
                {label.slice(0, 2).toUpperCase()}
              </span>
              <span className="font-mono text-[12px] uppercase tracking-[0.18em] text-aegis-mute">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
