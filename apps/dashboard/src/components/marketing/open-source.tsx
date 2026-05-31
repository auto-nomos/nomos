import { ArrowUpRight, Github } from 'lucide-react';
import Link from 'next/link';
import { GITHUB_RELEASES_URL, GITHUB_REPO_URL, NPM_ORG_URL } from '../../lib/community-links';

/**
 * Band 9 — Open source. The repo is public under Apache-2.0: npm packages are
 * live and the full control-plane + dashboard source is readable. Includes the
 * small license matrix built from real package data.
 */
const PACKAGES: { name: string; role: string; status: 'public' | 'soon' | 'source' }[] = [
  { name: '@auto-nomos/core', role: 'PDP decide() engine', status: 'public' },
  { name: '@auto-nomos/cedar', role: 'Policy evaluation', status: 'public' },
  { name: '@auto-nomos/ucan', role: 'Capability tokens', status: 'public' },
  { name: '@auto-nomos/crypto', role: 'DID + signing', status: 'public' },
  { name: '@auto-nomos/sdk', role: 'TS SDK for agents', status: 'public' },
  { name: '@auto-nomos/mcp-server', role: 'MCP server', status: 'public' },
  { name: '@auto-nomos/adapters', role: 'YAML connectors', status: 'public' },
  { name: '@auto-nomos/schema-packs', role: 'Tool-call validators', status: 'public' },
  { name: '@auto-nomos/policy-builder', role: 'React Flow editor', status: 'public' },
  { name: '@auto-nomos/audit-verify', role: 'Chain verify CLI', status: 'public' },
  { name: '@auto-nomos/cli', role: 'nomos CLI', status: 'public' },
  { name: '@auto-nomos/ucan-cli', role: 'nomos-ucan CLI', status: 'public' },
  { name: '@auto-nomos/shared-types', role: 'Zod schemas', status: 'public' },
  { name: 'nomos-sdk (PyPI)', role: 'Python SDK for agents', status: 'public' },
  { name: '@auto-nomos/control-plane', role: 'Hono + tRPC server', status: 'source' },
  { name: '@auto-nomos/dashboard', role: 'Next.js operator UI', status: 'source' },
];

const INSTALL_LINES: { lang: string; cmd: string }[] = [
  { lang: 'TypeScript SDK', cmd: 'npm i @auto-nomos/sdk' },
  { lang: 'Python SDK', cmd: 'pip install nomos-sdk' },
  { lang: 'CLI', cmd: 'npm i -g @auto-nomos/cli' },
  { lang: 'MCP server', cmd: 'npm i -g @auto-nomos/mcp-server' },
  {
    lang: 'Self-host PDP (Helm)',
    cmd: 'helm install pdp oci://ghcr.io/auto-nomos/charts/cb-pdp',
  },
];

export function OpenSource() {
  return (
    <section className="mx-auto max-w-[1280px] px-4 py-20 sm:px-6 sm:py-28 md:px-10 md:py-32">
      <div className="grid grid-cols-12 gap-10">
        <div className="col-span-12 lg:col-span-5">
          <div className="eyebrow flex items-center gap-3">
            <Github className="h-4 w-4 text-aegis-signal" aria-hidden />
            open source
          </div>
          <h2 className="display mt-5 text-[36px] leading-[1.05] text-aegis-paper sm:text-[44px] md:text-[56px] md:leading-[1.02]">
            Open source.
            <br />
            <em>Read every line.</em>
          </h2>
          <p className="mt-6 max-w-[460px] text-base leading-relaxed text-aegis-mute">
            Thirteen packages live on npm under{' '}
            <code className="rounded-sm border border-aegis-line bg-aegis-surface px-1.5 py-0.5 font-mono text-[12px] text-aegis-paper">
              @auto-nomos/*
            </code>
            , and the full control-plane and dashboard source is public too — all under Apache-2.0.
            Read every line, open an issue, send a PR.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="group inline-flex items-center gap-2 rounded-sm bg-aegis-signal px-5 py-3 font-mono text-[12px] uppercase tracking-[0.18em] text-aegis-ink transition-colors hover:bg-aegis-signal/90"
            >
              <Github className="h-4 w-4" />
              View on GitHub
            </a>
            <a
              href={GITHUB_RELEASES_URL}
              target="_blank"
              rel="noreferrer"
              className="group inline-flex items-center gap-2 rounded-sm border border-aegis-line px-5 py-3 font-mono text-[12px] uppercase tracking-[0.18em] text-aegis-paper transition-colors hover:border-aegis-line-strong"
            >
              Watch releases
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
            <Link
              href="/open-source"
              className="group inline-flex items-center gap-2 rounded-sm px-5 py-3 font-mono text-[12px] uppercase tracking-[0.18em] text-aegis-mute transition-colors hover:text-aegis-paper"
            >
              The full roadmap
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <a
            href={NPM_ORG_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-flex items-center gap-2 font-mono text-[11px] text-aegis-faint hover:text-aegis-signal"
          >
            npmjs.com/org/auto-nomos
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>
        <div className="col-span-12 lg:col-span-7">
          <div className="corners relative rounded-sm border border-aegis-line bg-aegis-ink">
            <div className="grid grid-cols-12 border-b border-aegis-line px-4 py-4 font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint sm:px-6">
              <div className="col-span-6">package</div>
              <div className="col-span-4">role</div>
              <div className="col-span-2 text-right">status</div>
            </div>
            <ul className="max-h-[440px] divide-y divide-aegis-line overflow-auto">
              {PACKAGES.map((p) => (
                <li
                  key={p.name}
                  className="grid grid-cols-12 items-center gap-3 px-4 py-3 transition-colors hover:bg-aegis-surface/40 sm:px-6"
                >
                  <div className="col-span-6 font-mono text-[12px] text-aegis-paper">{p.name}</div>
                  <div className="col-span-4 text-xs text-aegis-mute">{p.role}</div>
                  <div className="col-span-2 text-right">
                    <span
                      className={`inline-flex items-center rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] ${
                        p.status === 'soon'
                          ? 'border-aegis-amber/40 bg-aegis-amber/10 text-aegis-amber'
                          : 'border-aegis-signal/40 bg-aegis-signal/10 text-aegis-signal'
                      }`}
                    >
                      {p.status === 'public' ? 'on npm' : p.status === 'source' ? 'source' : 'soon'}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-aegis-line px-4 py-4 font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint sm:px-6">
              <span>license · Apache-2.0</span>
              <span className="text-aegis-paper">{PACKAGES.length} packages</span>
            </div>
          </div>
          <div className="mt-6 rounded-sm border border-aegis-line bg-aegis-ink">
            <div className="border-b border-aegis-line px-4 py-4 font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint sm:px-6">
              install in 30 seconds
            </div>
            <ul className="divide-y divide-aegis-line">
              {INSTALL_LINES.map((row) => (
                <li
                  key={row.lang}
                  className="grid grid-cols-12 items-center gap-3 px-4 py-3 transition-colors hover:bg-aegis-surface/40 sm:px-6"
                >
                  <div className="col-span-4 font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
                    {row.lang}
                  </div>
                  <code className="col-span-8 select-all break-all font-mono text-[12px] text-aegis-paper">
                    {row.cmd}
                  </code>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
