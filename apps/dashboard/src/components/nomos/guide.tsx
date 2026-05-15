'use client';

import {
  ArrowDownToLine,
  Boxes,
  Cloud,
  Cpu,
  FileLock2,
  GitBranch,
  HardDrive,
  Hash,
  KeyRound,
  Layers,
  MessageCircle,
  Plug,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Workflow,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';

/* ======================================================================
   Nomos — User guide
   ----------------------------------------------------------------------
   Editorial documentation page. Three columns at lg+:
     [240 TOC] [main copy] [240 right rail of related links + footnotes]
   The body type is sized for slow reading; the wide left margin gives
   each section air. Diagrams are SVG so they print + zoom cleanly.
   ====================================================================== */

interface Section {
  id: string;
  label: string;
  group?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

const SECTIONS: Section[] = [
  { id: 'what-is-nomos', label: 'What Nomos is', group: 'Foundations', icon: ShieldCheck },
  { id: 'mental-model', label: 'Mental model', group: 'Foundations', icon: Workflow },
  { id: 'quickstart', label: 'Quickstart', group: 'Foundations', icon: Cpu },
  { id: 'connections', label: 'Connections', group: 'Build', icon: Plug },
  { id: 'apps', label: 'Apps & API keys', group: 'Build', icon: Boxes },
  { id: 'policies', label: 'Policies', group: 'Build', icon: FileLock2 },
  { id: 'filesystem-ssh', label: 'Filesystem & SSH', group: 'Build', icon: HardDrive },
  { id: 'dynamic-intent', label: 'Dynamic intent', group: 'Runtime', icon: Workflow },
  { id: 'step-up', label: 'Step-up & passkeys', group: 'Runtime', icon: ShieldAlert },
  { id: 'standing-grants', label: 'Standing grants', group: 'Runtime', icon: Layers },
  { id: 'audit', label: 'Audit chain', group: 'Runtime', icon: Hash },
  { id: 'swarms', label: 'Swarms (delegation chains)', group: 'Runtime', icon: GitBranch },
  { id: 'cloud', label: 'Cloud IAM (Azure/AWS/GCP)', group: 'Runtime', icon: Cloud },
  { id: 'sdk', label: 'SDK & MCP', group: 'Integrate', icon: Terminal },
  { id: 'telegram', label: 'Telegram notifications', group: 'Integrate', icon: MessageCircle },
  { id: 'faq', label: 'FAQ', group: 'Reference', icon: KeyRound },
];

export function GuideContent() {
  const [active, setActive] = useState<string>(SECTIONS[0]!.id);

  // IntersectionObserver for the TOC active state — cheap scrollspy.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
            return;
          }
        }
      },
      { rootMargin: '-30% 0px -60% 0px', threshold: 0 },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="mx-auto max-w-[1280px]">
      <Header />
      <div className="mt-16 grid grid-cols-12 gap-10">
        <Toc sections={SECTIONS} active={active} />
        <article className="col-span-12 max-w-[680px] lg:col-span-7">
          <WhatIsNomos />
          <MentalModel />
          <Quickstart />
          <Connections />
          <Apps />
          <Policies />
          <FilesystemSsh />
          <DynamicIntent />
          <StepUp />
          <StandingGrants />
          <AuditChain />
          <Swarms />
          <CloudIam />
          <Sdk />
          <TelegramSetup />
          <Faq />
        </article>
        <RightRail />
      </div>
    </div>
  );
}

/* ─── Header ──────────────────────────────────────────────────────────── */

function Header() {
  return (
    <header className="border-b border-aegis-line pb-10">
      <div className="eyebrow">documentation · v0.1.x</div>
      <h1 className="display mt-5 max-w-[820px] text-[64px] text-aegis-paper">
        How to use <em>Nomos</em>.
      </h1>
      <p className="mt-6 max-w-[640px] text-base text-aegis-mute">
        A reading guide to the platform. Fourteen short sections — read top to bottom for
        orientation, or jump from the table of contents on the left. Code snippets are copy-paste
        ready.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-aegis-faint">
        <span>~20 min read</span>
        <span aria-hidden>·</span>
        <span>last updated 2026-05-15 · MAOS beta · filesystem + SSH GA · Cloud IAM preview</span>
        <span aria-hidden>·</span>
        <a href="#quickstart" className="text-aegis-signal hover:underline">
          Skip to 5-min quickstart →
        </a>
      </div>
    </header>
  );
}

/* ─── TOC ─────────────────────────────────────────────────────────────── */

function Toc({ sections, active }: { sections: Section[]; active: string }) {
  const groups = sections.reduce<Record<string, Section[]>>((acc, s) => {
    const key = s.group ?? 'More';
    (acc[key] = acc[key] ?? []).push(s);
    return acc;
  }, {});
  return (
    <nav className="col-span-12 lg:col-span-3 lg:sticky lg:top-24 lg:self-start">
      <div className="eyebrow mb-3">contents</div>
      {Object.entries(groups).map(([label, items]) => (
        <div key={label} className="mb-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
            {label}
          </div>
          <ul className="mt-2 space-y-1">
            {items.map((s) => {
              const isActive = active === s.id;
              return (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className={cn(
                      'group flex items-center gap-2 border-l border-aegis-line py-1.5 pl-3 text-sm transition-colors',
                      isActive
                        ? 'border-aegis-signal text-aegis-paper'
                        : 'text-aegis-mute hover:border-aegis-line-strong hover:text-aegis-paper',
                    )}
                  >
                    {s.icon ? (
                      <s.icon
                        className={cn(
                          'h-3.5 w-3.5',
                          isActive ? 'text-aegis-signal' : 'text-aegis-faint',
                        )}
                      />
                    ) : null}
                    {s.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/* ─── Right rail ──────────────────────────────────────────────────────── */

function RightRail() {
  return (
    <aside className="col-span-12 lg:col-span-2 lg:sticky lg:top-24 lg:self-start">
      <div className="eyebrow mb-3">jump to product</div>
      <ul className="space-y-2 text-sm">
        {[
          { href: '/app/connections', label: 'Connections' },
          { href: '/app/agents', label: 'Apps' },
          { href: '/app/policies', label: 'Policies' },
          { href: '/app/audit', label: 'Audit' },
          { href: '/app/swarms', label: 'Swarms' },
          { href: '/app/cloud', label: 'Cloud accounts' },
          { href: '/app/grants', label: 'Standing grants' },
          { href: '/app/settings/notifications', label: 'Notifications' },
        ].map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="text-aegis-mute transition-colors hover:text-aegis-paper"
            >
              {l.label} →
            </Link>
          </li>
        ))}
      </ul>
      <div className="eyebrow mb-3 mt-8">downloads</div>
      <ul className="space-y-2 text-sm">
        <li>
          <a
            href="#"
            className="inline-flex items-center gap-1.5 text-aegis-mute transition-colors hover:text-aegis-paper"
          >
            <ArrowDownToLine className="h-3.5 w-3.5" />
            SDK changelog
          </a>
        </li>
        <li>
          <a
            href="#"
            className="inline-flex items-center gap-1.5 text-aegis-mute transition-colors hover:text-aegis-paper"
          >
            <ArrowDownToLine className="h-3.5 w-3.5" />
            audit-verify CLI
          </a>
        </li>
      </ul>
    </aside>
  );
}

/* ─── Section primitives ──────────────────────────────────────────────── */

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-32 border-b border-aegis-line py-14 first:pt-0 last:border-0"
    >
      {eyebrow ? <div className="eyebrow mb-4">{eyebrow}</div> : null}
      <h2 className="display text-[40px] text-aegis-paper">{title}</h2>
      <div className="prose-aegis mt-6 space-y-5 text-[15px] leading-[1.7] text-aegis-paper/90">
        {children}
      </div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>;
}

function K({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-[3px] border border-aegis-line bg-aegis-surface-2 px-1.5 py-0.5 font-mono text-[13px] text-aegis-paper">
      {children}
    </code>
  );
}

function Code({ children, lang }: { children: string; lang?: string }) {
  return (
    <figure className="overflow-hidden rounded-sm border border-aegis-line bg-aegis-surface-2">
      <figcaption className="flex items-center justify-between border-b border-aegis-line px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
        <span>{lang ?? 'shell'}</span>
        <span>copy</span>
      </figcaption>
      <pre className="overflow-x-auto px-4 py-3 font-mono text-[13px] leading-[1.6] text-aegis-paper">
        <code>{children}</code>
      </pre>
    </figure>
  );
}

function Callout({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warn' | 'signal';
  children: React.ReactNode;
}) {
  const tones = {
    info: 'border-aegis-iris/40 bg-aegis-iris/5 text-aegis-paper',
    warn: 'border-aegis-amber/40 bg-aegis-amber/5 text-aegis-paper',
    signal: 'border-aegis-signal/40 bg-aegis-signal/5 text-aegis-paper',
  } as const;
  return (
    <div className={cn('rounded-sm border-l-2 px-4 py-3 text-[14px] leading-relaxed', tones[tone])}>
      {children}
    </div>
  );
}

/* ─── Sections — content ──────────────────────────────────────────────── */

function WhatIsNomos() {
  return (
    <Section id="what-is-nomos" eyebrow="01 · what" title="What Nomos is.">
      <P>
        Nomos is an authorization layer for AI agents. It sits between your agents and every SaaS
        API you connect — GitHub, Slack, Linear, Stripe, Google, Notion, your filesystem. The agent
        never holds a raw OAuth token. Instead, it asks Nomos to mint a short-lived cryptographic
        delegation (a UCAN) bound to one specific request.
      </P>
      <P>Three guarantees follow from that:</P>
      <ul className="ml-6 list-disc space-y-2 marker:text-aegis-signal">
        <li>
          <strong className="text-aegis-paper">Credentials never leak.</strong> The agent gets a
          token whose blast radius is one method on one resource for the next few minutes.
        </li>
        <li>
          <strong className="text-aegis-paper">Policy is enforced before the call.</strong> The PDP
          runs your Cedar policy on every request — denial is a 403, not a follow-up email.
        </li>
        <li>
          <strong className="text-aegis-paper">Every decision is provable.</strong> Allows, denies,
          and step-ups land in an Ed25519-signed Merkle chain. Anyone with the verifier CLI can
          audit it offline.
        </li>
      </ul>
    </Section>
  );
}

function MentalModel() {
  return (
    <Section id="mental-model" eyebrow="02 · model" title="Mental model.">
      <P>
        Five moving parts. The agent talks to the SDK; the SDK talks to the control plane; the
        control plane mints UCANs; the PDP checks them and proxies upstream; the audit chain
        remembers everything.
      </P>
      <DiagramFlow />
      <P>
        For the human side: you connect SaaS apps once via OAuth, register one App per agent, write
        a policy, then watch the audit panel. When something risky happens, you get a passkey prompt
        — that&rsquo;s the step-up loop.
      </P>
    </Section>
  );
}

function Quickstart() {
  return (
    <Section id="quickstart" eyebrow="03 · quickstart" title="Five-minute setup.">
      <ol className="ml-0 list-none space-y-4">
        <Step n="01" title="Connect a SaaS">
          Visit{' '}
          <Link href="/app/connections" className="text-aegis-signal hover:underline">
            Connections
          </Link>
          , click <K>Bind GitHub</K>. The OAuth round-trip stores the token encrypted in the broker;
          you never see it again.
        </Step>
        <Step n="02" title="Register an App">
          Open{' '}
          <Link href="/app/agents" className="text-aegis-signal hover:underline">
            Apps
          </Link>{' '}
          → <K>New app</K>. Issue an API key. The key is shown once — copy it.
        </Step>
        <Step n="03" title="Pick a starter policy">
          On{' '}
          <Link href="/app/policies" className="text-aegis-signal hover:underline">
            Policies
          </Link>
          , choose a template (e.g. <K>github:read-only</K>) and assign it to the App. Or draft your
          own in the visual builder.
        </Step>
        <Step n="04" title="Wire the SDK">
          In your agent code:
        </Step>
      </ol>
      <Code lang="typescript">{`import { createIntentClient } from '@auto-nomos/sdk';

const client = createIntentClient({
  controlPlaneUrl: 'https://control.aegis.example',
  apiKey: process.env.NOMOS_API_KEY!,
});

const grant = await client.acquire(
  {
    constraint: { provider: 'github', owner: 'acme', repo: 'app' },
    actions: ['/github/issue/list'],
    ttlSeconds: 600,
    purpose: 'triage open backlog issues',
  },
  awaitApprovalViaDashboard, // your callback
);

// grant.ucan goes in the Authorization header to the PDP proxy.`}</Code>
      <Callout tone="signal">
        <strong className="text-aegis-paper">That&rsquo;s it.</strong> The next section walks
        through what each call does. If you only want to ship, you can stop here.
      </Callout>
    </Section>
  );
}

function Connections() {
  return (
    <Section id="connections" eyebrow="04 · build" title="Connections.">
      <P>
        A Connection is an OAuth binding to one SaaS provider. Nomos ships connectors for GitHub,
        Slack, Google (Drive · Calendar · Gmail · Docs · Sheets · Tasks · Contacts), Notion, Linear,
        and Stripe Connect. Non-OAuth providers (<K>filesystem</K> and <K>ssh</K>) are configured
        per-PDP from environment — see{' '}
        <a href="#filesystem-ssh" className="text-aegis-signal hover:underline">
          Filesystem &amp; SSH
        </a>
        .
      </P>
      <P>
        Connections live in{' '}
        <Link href="/app/connections" className="text-aegis-signal hover:underline">
          Connections
        </Link>
        . Each row shows the connected account, granted scopes, and refresh status. Nomos sweeps
        refreshable tokens on a one-hour cadence with a 24-hour lookahead — Stripe Connect and
        Notion are flagged as non-refreshable and require re-auth when they expire.
      </P>
      <Callout tone="warn">
        Tokens are encrypted at rest with <K>OAUTH_TOKEN_ENCRYPTION_KEY</K> (XChaCha20-Poly1305).
        Generate a real key with <K>pnpm gen-keys</K> before you store production credentials.
      </Callout>
    </Section>
  );
}

function Apps() {
  return (
    <Section id="apps" eyebrow="05 · build" title="Apps & API keys.">
      <P>
        An <em className="text-aegis-signal not-italic">App</em> is one agent identity. It has a
        DID, a status (active / disabled), a mode (static / dynamic), and zero or more API keys. The
        API key is what your agent presents to the control plane; the DID is what the PDP recognizes
        as the request audience.
      </P>
      <P>
        Static-mode apps are the safe default — they call <K>/v1/mint-ucan</K> directly with a
        pre-set command. Dynamic-mode apps additionally get access to <K>/v1/intent</K>, where the
        agent narrates a constraint at runtime and Nomos decides whether to mint silently or
        escalate to step-up.
      </P>
      <Code lang="bash">{`# Issue an API key (visible once)
curl -X POST $CONTROL/trpc/apiKeys.create \\
  -H "authorization: Bearer $SESSION" \\
  -H "content-type: application/json" \\
  -d '{ "agentId": "...", "label": "prod" }'`}</Code>
    </Section>
  );
}

function Policies() {
  return (
    <Section id="policies" eyebrow="06 · build" title="Policies.">
      <P>
        Policies are written in{' '}
        <a
          href="https://www.cedarpolicy.com"
          className="text-aegis-signal hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          Cedar
        </a>
        . You can author them three ways:
      </P>
      <ul className="ml-6 list-disc space-y-1.5 marker:text-aegis-signal">
        <li>Pick a starter template from a schema-pack (~5 per integration).</li>
        <li>Draft visually in the policy builder — the UI emits Cedar.</li>
        <li>Type Cedar directly in the editor with autocomplete.</li>
      </ul>
      <P>
        Nomos round-trips every visual edit through the parser before save: the visual
        representation is never allowed to drift from the actual Cedar that runs.
      </P>
      <Code lang="cedar">{`permit (
  principal,
  action in [Action::"/github/issue/read", Action::"/github/issue/list"],
  resource
);

permit (
  principal,
  action == Action::"/github/issue/close",
  resource
)
when { context.cosigner == true };  // step-up to close`}</Code>
    </Section>
  );
}

function FilesystemSsh() {
  return (
    <Section id="filesystem-ssh" eyebrow="07 · build · GA" title="Filesystem & SSH.">
      <P>
        Two providers without OAuth: <K>filesystem</K> (the PDP&rsquo;s local disk) and <K>ssh</K>{' '}
        (remote SFTP + shell over SSH). Same Cedar gate, same UCAN constraint, same audit chain as
        the SaaS connectors — the auth model is the only thing that differs (host-local rather than
        OAuth refresh tokens).
      </P>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-aegis-line text-left font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
            <th className="py-2 pr-4">Provider</th>
            <th className="py-2 pr-4">Auth</th>
            <th className="py-2 pr-4">Ops</th>
            <th className="py-2">Templates</th>
          </tr>
        </thead>
        <tbody className="text-aegis-paper">
          <tr className="border-b border-aegis-line/60">
            <td className="py-2 pr-4 font-mono">filesystem</td>
            <td className="py-2 pr-4">PDP host (no token)</td>
            <td className="py-2 pr-4">11 (file + dir CRUD)</td>
            <td className="py-2">8</td>
          </tr>
          <tr>
            <td className="py-2 pr-4 font-mono">ssh</td>
            <td className="py-2 pr-4">SSH private key (env)</td>
            <td className="py-2 pr-4">12 (incl. /ssh/exec)</td>
            <td className="py-2">6</td>
          </tr>
        </tbody>
      </table>

      <h3 className="mt-8 font-display text-[22px] text-aegis-paper">Connecting</h3>
      <P>
        Neither provider has an OAuth round-trip. The PDP reads credentials from environment at
        boot:
      </P>
      <Code lang="shell">{`# Filesystem — runs as the PDP process. No env needed.
#   All scoping is enforced from the UCAN resource_constraint.path_prefix.

# SSH — one keypair per PDP instance (v1.0; multi-tenant key isolation deferred).
SSH_PRIVATE_KEY="-----BEGIN OPENSSH PRIVATE KEY-----..."
SSH_PASSPHRASE="optional"
SSH_KNOWN_HOSTS="github.com ssh-rsa AAAA..."   # defined but not yet wired (v1.1)`}</Code>
      <P>
        After boot, mint a UCAN with a <K>resource_constraint</K> carrying the path prefix and (for
        SSH) the host. The PDP refuses anything outside the constraint.
      </P>
      <Code lang="json">{`// filesystem constraint
{
  "provider": "filesystem",
  "path_prefix": "/srv/workspaces/agent-42"
}

// ssh constraint
{
  "provider": "ssh",
  "host": "ops-01.example.com",
  "username": "deploy",
  "path_prefix": "/var/www/app"
}`}</Code>

      <h3 className="mt-8 font-display text-[22px] text-aegis-paper">Cedar templates</h3>
      <P>
        Both packs ship pre-built templates pickable from{' '}
        <Link href="/app/policies" className="text-aegis-signal hover:underline">
          /app/policies → Templates
        </Link>
        . Names match the schema-pack ids.
      </P>
      <ul className="ml-6 list-disc space-y-1 marker:text-aegis-signal">
        <li>
          <K>filesystem:read-only</K> — read + list, no path constraint required.
        </li>
        <li>
          <K>filesystem:subdir-read</K> · <K>filesystem:write-subdir</K> — gated by{' '}
          <K>path_prefix</K>.
        </li>
        <li>
          <K>filesystem:business-hours-write</K> — write only 09:00–18:00.
        </li>
        <li>
          <K>filesystem:extension-filter</K> — limit to <K>.py</K> / <K>.ts</K> / etc.
        </li>
        <li>
          <K>filesystem:delete-step-up</K> · <K>filesystem:audit-only-delete</K> — passkey required
          to <K>unlink</K>.
        </li>
        <li>
          <K>filesystem:developer-sandbox</K> — full CRUD inside a single sandbox dir.
        </li>
        <li>
          <K>ssh:host-pinned-read</K> · <K>ssh:sftp-upload</K> · <K>ssh:host-subdir-full</K> — host-
          and path-pinned SFTP.
        </li>
        <li>
          <K>ssh:exec-step-up</K> · <K>ssh:delete-step-up</K> — step-up gates on shell exec and
          remote delete.
        </li>
        <li>
          <K>ssh:read-write-no-exec</K> — SFTP only; <K>/ssh/exec</K> explicitly forbidden.
        </li>
      </ul>

      <h3 className="mt-8 font-display text-[22px] text-aegis-paper">Five common use cases</h3>
      <ol className="ml-6 list-decimal space-y-2 marker:text-aegis-signal">
        <li>
          <strong className="text-aegis-paper">Researcher reads a code tree.</strong>{' '}
          <K>filesystem:subdir-read</K> + <K>path_prefix=/repos/acme</K>. Read + tree, no writes.
        </li>
        <li>
          <strong className="text-aegis-paper">Codegen agent rewrites files.</strong>{' '}
          <K>filesystem:write-subdir</K> + <K>filesystem:extension-filter</K> pinned to <K>.ts</K> /{' '}
          <K>.tsx</K>. Deletes require passkey.
        </li>
        <li>
          <strong className="text-aegis-paper">Deploy bot pushes a build.</strong>{' '}
          <K>ssh:sftp-upload</K> to <K>/var/www/app</K> on a pinned host. No shell exec — uploads
          only.
        </li>
        <li>
          <strong className="text-aegis-paper">Incident recovery agent.</strong>{' '}
          <K>ssh:host-subdir-full</K> on the broken box. Any <K>/ssh/exec</K> hits{' '}
          <K>ssh:exec-step-up</K> and pings the on-call passkey.
        </li>
        <li>
          <strong className="text-aegis-paper">Throwaway sandbox.</strong>{' '}
          <K>filesystem:developer-sandbox</K> + <K>path_prefix=/tmp/agent-{`{id}`}</K>. Full CRUD,
          no leakage outside the sandbox.
        </li>
      </ol>

      <h3 className="mt-8 font-display text-[22px] text-aegis-paper">Defenses in depth</h3>
      <P>The PDP enforces five overlapping checks on every filesystem/ssh request:</P>
      <ul className="ml-6 list-disc space-y-1 marker:text-aegis-signal">
        <li>
          <strong className="text-aegis-paper">Path-prefix boundary</strong> — strict{' '}
          <K>prefix + &lsquo;/&rsquo;</K> match. <K>/foobar</K> never matches prefix <K>/foo</K>.
        </li>
        <li>
          <strong className="text-aegis-paper">Symlink escape</strong> — <K>fs.realpath()</K> on
          both source and destination; refuses if resolved path leaves the prefix.
        </li>
        <li>
          <strong className="text-aegis-paper">Shell metachar reject</strong> — paths containing{' '}
          <K>$</K>, backtick, <K>${`{`}</K>, <K>$(</K>, newline, or backslash are denied
          pre-dispatch.
        </li>
        <li>
          <strong className="text-aegis-paper">Shell quoting</strong> — every <K>mkdir -p</K> /{' '}
          <K>rm -rf</K> path is POSIX single-quote escaped via <K>shQuote()</K>.
        </li>
        <li>
          <strong className="text-aegis-paper">Timeouts + caps</strong> — SSH connect 10 s, op 30 s,
          exec 120 s ceiling. <K>/ssh/exec</K> output capped at 1 MB per stream (
          <K>truncated: true</K> in the response).
        </li>
      </ul>

      <h3 className="mt-8 font-display text-[22px] text-aegis-paper">MCP tools</h3>
      <P>
        The MCP server (<K>@auto-nomos/mcp-server</K> 0.0.18+) registers tools per provider — your
        agent sees them under their provider namespace and the PDP gates each call identically to a
        REST call:
      </P>
      <Code lang="text">{`filesystem_file_read           ssh_file_read           ssh_dir_create
filesystem_file_write          ssh_file_write          ssh_dir_delete
filesystem_file_create         ssh_file_create         ssh_dir_delete_recursive
filesystem_file_delete         ssh_file_delete         ssh_exec     (step-up)
filesystem_file_move           ssh_file_move
filesystem_file_copy           ssh_file_copy
filesystem_dir_list            ssh_dir_list
filesystem_dir_tree            ssh_dir_tree
filesystem_dir_create
filesystem_dir_delete
filesystem_dir_delete_recursive`}</Code>
      <Callout tone="signal">
        Cursor / Claude Desktop config: pin <K>@auto-nomos/mcp-server@0.0.18</K>. The integration
        label shows up as <K>Filesystem</K> and <K>SSH / SFTP</K> in the MCP picker.
      </Callout>

      <h3 className="mt-8 font-display text-[22px] text-aegis-paper">Observability</h3>
      <P>
        Filesystem and SSH events use the same{' '}
        <Link href="/app/audit" className="text-aegis-signal hover:underline">
          audit
        </Link>{' '}
        +{' '}
        <Link href="/app/swarms" className="text-aegis-signal hover:underline">
          swarms
        </Link>{' '}
        infrastructure as every other provider — no provider-specific viewer. Filter on{' '}
        <K>provider:filesystem</K> or <K>provider:ssh</K>; each row carries:
      </P>
      <ul className="ml-6 list-disc space-y-1 marker:text-aegis-signal">
        <li>
          <K>command</K> (e.g. <K>/ssh/exec</K>), <K>decision</K>, <K>resource.path</K>,{' '}
          <K>resource.host</K>
        </li>
        <li>
          For <K>/ssh/exec</K>: <K>context.exec.exitCode</K>, <K>context.exec.truncated</K>,{' '}
          <K>context.exec.durationMs</K>
        </li>
        <li>
          Constraint snapshot (<K>path_prefix</K>, <K>host</K>) at decision time
        </li>
        <li>
          <K>hash</K> / <K>prevHash</K> for tamper-evident chain, same as SaaS receipts
        </li>
      </ul>
      <P>
        The action graph at <K>/app/swarms/{`{id}`}</K> renders filesystem / SSH calls as nodes
        alongside SaaS calls — the ActionGraph is provider-agnostic. A swarm that reads from GitHub,
        writes to <K>filesystem</K>, then runs <K>/ssh/exec</K> shows up as one chained DAG with
        per-edge latencies and decisions.
      </P>

      <Callout tone="warn">
        <strong className="text-aegis-paper">Operational gotchas:</strong> one SSH key per PDP
        process (multi-tenant key isolation lands in v1.1); <K>SSH_KNOWN_HOSTS</K> is parsed but not
        yet enforced by node-ssh; <K>/ssh/exec</K> is opt-in per policy — the default ssh templates
        do not allow it.
      </Callout>
    </Section>
  );
}

function DynamicIntent() {
  return (
    <Section id="dynamic-intent" eyebrow="08 · runtime" title="Dynamic intent.">
      <P>
        For dynamic agents, every call begins with an <K>Intent</K> — a structured declaration of{' '}
        <em className="not-italic">where</em> (resource constraint),{' '}
        <em className="not-italic">what</em> (actions), and <em className="not-italic">why</em>{' '}
        (purpose). Nomos runs three gates:
      </P>
      <ol className="ml-6 list-decimal space-y-1.5 marker:text-aegis-signal">
        <li>Heuristic risk classifier (sensitive paths, write verbs, org-admin actions).</li>
        <li>Envelope cover — does an active grant already permit this?</li>
        <li>
          Optional LLM coherence check — does the request match the declared{' '}
          <em className="not-italic">purpose</em>? Catches semantic drift (an envelope to email Bob
          being used to email Carol).
        </li>
      </ol>
      <Callout tone="info">
        The LLM check uses Claude Haiku 4.5 with a 1.5-second timeout and fails closed. It&rsquo;s
        off by default — enable per-environment with <K>INTENT_COHERENCE_ENABLED=true</K>.
      </Callout>
    </Section>
  );
}

function StepUp() {
  return (
    <Section id="step-up" eyebrow="09 · runtime" title="Step-up & passkeys.">
      <P>
        When any gate denies, Nomos writes an approval row, sends a deep link to your phone (web
        push, email, or Telegram — your choice in Notification settings), and waits. You open the
        link, your passkey signs the approval, and a cosigner UCAN is minted. The agent retries the
        same intent with the cosigner attached — the PDP now allows it.
      </P>
      <DiagramStepUp />
      <P>
        Step-up TTL is 60 seconds by default. The passkey assertion happens on your device; the
        assertion never leaves the browser. The cosigner UCAN expires 5 minutes after issue.
      </P>
    </Section>
  );
}

function StandingGrants() {
  return (
    <Section id="standing-grants" eyebrow="10 · runtime" title="Standing grants.">
      <P>
        Some grants are durable. &ldquo;This agent can always read my Linear issues&rdquo; should
        not require a passkey every session. On the approve page, choose <K>Standing</K> instead of{' '}
        <K>Session</K>. The envelope is created with no expiry; only explicit revocation kills it.
      </P>
      <Callout tone="warn">
        Standing grants are a real attack surface. Nomos always requires step-up + passkey to{' '}
        <em className="not-italic">create</em> one, but afterward it silently mints UCANs in their
        scope. Review them on the{' '}
        <Link href="/app/grants" className="text-aegis-signal hover:underline">
          Standing grants
        </Link>{' '}
        screen.
      </Callout>
    </Section>
  );
}

function AuditChain() {
  return (
    <Section id="audit" eyebrow="11 · runtime" title="Audit chain.">
      <P>
        Every authorize, every step-up, every revocation lands in <K>audit_events</K>. Each row
        hashes the previous row&rsquo;s hash plus its own canonicalized payload — a Merkle list
        that&rsquo;s tamper-evident from any signed root onward.
      </P>
      <P>
        Once a day, the broker signs a root with an Ed25519 key (<K>AUDIT_SIGN_KEY</K>) and stores
        it in <K>audit_roots</K>. The same payloads are archived as Parquet to Cloudflare R2 with a
        7-year lifecycle. To prove an event was in the chain, download its proof bundle and run:
      </P>
      <Code lang="bash">{`pnpm dlx @auto-nomos/audit-verify \\
  --bundle event-92ab.json \\
  --pubkey $AUDIT_VERIFY_KEY`}</Code>
    </Section>
  );
}

function Swarms() {
  return (
    <Section id="swarms" eyebrow="12 · runtime · beta" title="Swarms (delegation chains).">
      <P>
        Most agents do one thing. The next era is <em className="not-italic">swarms</em> — a planner
        agent forks a researcher, the researcher forks a writer, each step calls a different SaaS.
        Nomos models that pipeline natively: every fork passes the parent&rsquo;s UCAN as a proof,
        scope can only narrow downstream (UCAN attenuation), and the PDP rejects any chain that
        violates depth caps or attenuation rules.
      </P>
      <P>
        A &ldquo;swarm&rdquo; is just a tree of Apps with one root. The dashboard view at{' '}
        <Link href="/app/swarms" className="text-aegis-signal hover:underline">
          Swarms
        </Link>{' '}
        renders the tree, the recent receipts, and a <K>ScopeContainment</K> diff showing where each
        leaf&rsquo;s effective capability sits relative to the root.
      </P>

      <h3 className="mt-8 font-display text-[22px] text-aegis-paper">
        Walkthrough — planner → researcher → writer
      </h3>
      <P>
        Concrete recipe for a 3-deep swarm hitting GitHub. Same shape we ship in{' '}
        <K>examples/swarm-orchestrator/</K> and validated against prod.
      </P>
      <ol className="ml-6 list-decimal space-y-2 marker:text-aegis-signal">
        <li>
          <Link href="/app/agents" className="text-aegis-signal hover:underline">
            /app/agents
          </Link>{' '}
          → create three apps: <K>planner</K>, <K>researcher</K>, <K>writer</K>. Each gets an
          Ed25519 keypair (private key sealed at rest) and an API key (visible once — copy now).
        </li>
        <li>
          <Link href="/app/connections" className="text-aegis-signal hover:underline">
            /app/connections
          </Link>{' '}
          → bind GitHub OAuth. Note the connection UUID; the planner&rsquo;s root UCAN will carry it
          as <K>oauth_connection_id</K>.
        </li>
        <li>
          <Link href="/app/policies" className="text-aegis-signal hover:underline">
            /app/policies
          </Link>{' '}
          → assign <K>Safe default github</K> to all three. The PDP enforces the same Cedar bundle
          on every hop, not just the leaf.
        </li>
        <li>
          <Link href="/app/swarms" className="text-aegis-signal hover:underline">
            /app/swarms
          </Link>{' '}
          → <K>+ Create swarm</K>, name it, pick <K>planner</K> as root, leave maxDepth=8.
        </li>
        <li>
          Open the swarm. Use <K>Attach child agent</K> twice: <K>researcher</K> under{' '}
          <K>planner</K>, then <K>writer</K> under <K>researcher</K>. (DB metadata only — the actual
          chain enforcement still requires that each child UCAN&rsquo;s <K>iss</K> equals its
          parent&rsquo;s <K>aud</K>.)
        </li>
      </ol>

      <h3 className="mt-8 font-display text-[22px] text-aegis-paper">
        What each swarm-view card does
      </h3>
      <Code lang="text">{`┌─ /app/swarms/{id} ──────────────────────────────────────────────────┐
│  prod-test-swarm                              [⏵ Connect agents]    │
│  3 agents · max depth 8                                             │
├─────────────────────────────────────────────────────────────────────┤
│ ● Agent tree                                                        │
│   ├── ● planner       did:…GNK2  depth 0  (root)                    │
│   │   └── ● researcher did:…WgkP  depth 1                           │
│   │       └── ● writer did:…dfLb  depth 2                           │
├─────────────────────────────────────────────────────────────────────┤
│ ● Attach child agent                                                │
│   Parent [ planner ▾ ]  Child [ researcher ▾ ]  [ Attach ]          │
├─────────────────────────────────────────────────────────────────────┤
│ ● Approve for chain                                                 │
│   Root [ planner ▾ ]  TTL [ 1h ▾ ]                                  │
│   Snapshot covers: planner, researcher, writer (3 agents @ now)     │
│   [ Approve & mint cosigner ]                                       │
├─────────────────────────────────────────────────────────────────────┤
│ ● Scope containment (per agent: last decision + chain depth)        │
├─────────────────────────────────────────────────────────────────────┤
│ ● Recent receipts (Agent column = name; hover for full DID)         │
│   When           Decision  Command            Agent      Depth      │
│   11:57:17 AM    allow     /github/issue/list writer     2          │
│   11:57:14 AM    allow     /github/issue/list researcher 1          │
│   11:57:12 AM    allow     /github/issue/list planner    0          │
└─────────────────────────────────────────────────────────────────────┘`}</Code>
      <ul className="ml-6 list-disc space-y-1.5 marker:text-aegis-signal">
        <li>
          <strong className="text-aegis-paper">Agent tree</strong> — pure visual; built from{' '}
          <K>agents.parentAgentId</K>. Collapses past depth 3.
        </li>
        <li>
          <strong className="text-aegis-paper">Attach child agent</strong> — metadata only. Teaches
          the dashboard the tree shape so containment + snapshots render correctly. The PDP
          doesn&rsquo;t care about this row — it only cares that the runtime UCAN chain actually
          validates.
        </li>
        <li>
          <strong className="text-aegis-paper">Approve for chain</strong> — operator preempts. The
          snapshot is materialized at click time (<K>approvedAgentIds = [...]</K>). A child forked{' '}
          <em className="not-italic">after</em> approval is <em className="not-italic">not</em>{' '}
          covered.
        </li>
        <li>
          <strong className="text-aegis-paper">Scope containment</strong> — per-agent quick check
          (last decision, chain depth, last command).
        </li>
        <li>
          <strong className="text-aegis-paper">Recent receipts</strong> — last 100 authorize calls
          scoped to this swarm. Agent column shows the friendly name; hover the cell to reveal the
          full <K>did:key:…</K>.
        </li>
      </ul>

      <h3 className="mt-8 font-display text-[22px] text-aegis-paper">
        Approval flows — when each one fires
      </h3>
      <ul className="ml-6 list-disc space-y-1.5 marker:text-aegis-signal">
        <li>
          <strong className="text-aegis-paper">One-shot push</strong> — Cedar returns step-up on one
          call; surfaces in{' '}
          <Link href="/app/approvals" className="text-aegis-signal hover:underline">
            /app/approvals
          </Link>{' '}
          (per-app). Day-1 default.
        </li>
        <li>
          <strong className="text-aegis-paper">Snapshot chain approval</strong> — preempts a
          tree-shaped wave of step-ups. Approves the materialized agent set; new children excluded.
          Lives in the swarm view.
        </li>
        <li>
          <strong className="text-aegis-paper">Mid-chain step-up</strong> — fires when a deeper
          agent (e.g. <K>writer</K> on <K>POST /repos/.../issues</K>) hits a write-protected command
          and there&rsquo;s no covering snapshot. Surfaces via mobile push / email /{' '}
          <K>/approve/{`{envelopeId}`}</K>.
        </li>
      </ul>

      <h3 className="mt-8 font-display text-[22px] text-aegis-paper">
        How calls show up in /app/audit
      </h3>
      <P>
        Same rows, cross-swarm. The <strong>App</strong> column shows the app name; hover for the
        full DID. Click any row to open the proof drawer:
      </P>
      <ul className="ml-6 list-disc space-y-1.5 marker:text-aegis-signal">
        <li>
          <K>event_id</K>, <K>prevHash</K>, <K>hash</K> (tamper chain)
        </li>
        <li>
          <K>parent_receipt_id</K>, <K>chainDepth</K>, <K>swarmId</K> (causation chain)
        </li>
        <li>
          full <K>resource</K> + <K>context</K> (collapsible JSON)
        </li>
        <li>
          <K>Download proof</K> → JSON bundle; verify offline with{' '}
          <K>npx @auto-nomos/audit-verify audit-proof-{`{eventId}`}.json</K>.
        </li>
      </ul>
      <P>
        The CSV / JSON exports at the top of <K>/app/audit</K> now include the whole row —{' '}
        <K>agentName</K>, <K>agentDid</K>, <K>command</K>, <K>decision</K>, <K>eventId</K>,{' '}
        <K>prevHash</K>, <K>hash</K>, <K>chainDepth</K>, <K>swarmId</K>, <K>parentReceiptId</K>,{' '}
        <K>resource</K>, <K>context</K>. Pipe straight into Splunk / Datadog / your warehouse.
      </P>

      <h3 className="mt-8 font-display text-[22px] text-aegis-paper">Wire format</h3>
      <P>
        The chain is propagated through three environment variables — orchestrator-agnostic so
        LangGraph, CrewAI, AutoGen, and Claude sub-agents all work without importing the SDK:
      </P>
      <Code lang="shell">{`# Set on the child process before fork
NOMOS_PARENT_UCAN_CHAIN='["<rootJWT>","<midJWT>"]'   # JSON array, root-first
NOMOS_PARENT_RECEIPT_ID='evt_…'                     # parent's last allow receipt
NOMOS_SWARM_ID='swm_…'                              # optional swarm grouping
NOMOS_MAX_CHAIN_DEPTH=8                             # default; PDP enforces`}</Code>
      <Callout tone="info">
        If <K>NOMOS_PARENT_UCAN_CHAIN</K> would exceed the env-var limit (~128 KB on Linux), use the
        file fallback: <K>NOMOS_PARENT_UCAN_CHAIN_FILE=/tmp/nomos-chain.json</K>.
      </Callout>

      <h3 className="mt-8 font-display text-[22px] text-aegis-paper">
        Forking a child (TypeScript)
      </h3>
      <Code lang="typescript">{`import { forkChild, createAuthorize } from '@auto-nomos/sdk';
import { mintUcan } from '@auto-nomos/ucan';

const parentChain = readParentChainFromEnv(process.env);
const childUcan = await mintUcan({ /* attenuated audience + capability */ });

const childChain = forkChild({
  parentChain,
  childUcanJwt: childUcan.jwt,
  parentReceiptId: process.env.NOMOS_PARENT_RECEIPT_ID,
  swarmId: process.env.NOMOS_SWARM_ID,
});

// Pass to the spawned subprocess as env
spawn('node', ['./researcher.js'], {
  env: {
    ...process.env,
    NOMOS_PARENT_UCAN_CHAIN: JSON.stringify(childChain.chain),
    NOMOS_PARENT_RECEIPT_ID: childChain.parentReceiptId ?? '',
    NOMOS_SWARM_ID: childChain.swarmId ?? '',
  },
});`}</Code>

      <h3 className="mt-8 font-display text-[22px] text-aegis-paper">
        Forking a child (Python / CLI)
      </h3>
      <P>
        Python parity ships via the <K>nomos-ucan</K> Bun-compiled binary. The Python SDK shells out
        for any UCAN minting; everything else is plain HTTPS.
      </P>
      <Code lang="python">{`from nomos import AuthGuard, fork_child, read_parent_chain_from_env

guard = AuthGuard(control_plane_url=os.environ["NOMOS_CONTROL_URL"],
                  api_key=os.environ["NOMOS_API_KEY"])

parent = read_parent_chain_from_env(os.environ)
child = fork_child(parent_chain=parent.chain,
                   audience_did="did:key:z6Mk...researcher",
                   capabilities=[{"with":"github://acme/app","can":"repo:read"}])

env = {**os.environ,
       "NOMOS_PARENT_UCAN_CHAIN": json.dumps(child["chain"]),
       "NOMOS_PARENT_RECEIPT_ID": child.get("parentReceiptId",""),
       "NOMOS_SWARM_ID": child.get("swarmId","")}
subprocess.Popen(["python","./researcher.py"], env=env)`}</Code>

      <h3 className="mt-8 font-display text-[22px] text-aegis-paper">Cedar templates</h3>
      <P>
        The <K>swarm-safe</K> schema-pack ships four Cedar templates that read the chain principal
        attributes <K>delegationDepth</K>, <K>rootAgent</K>, <K>invokedBy</K>:
      </P>
      <ul className="ml-6 list-disc space-y-1.5 marker:text-aegis-signal">
        <li>
          <K>forbid-deep-delegation</K> — caps chain depth (defends against runaway sub-agent
          spawn).
        </li>
        <li>
          <K>pin-root-agent</K> — only allow if rooted at a specific App (locks a swarm to one
          owner).
        </li>
        <li>
          <K>block-tainted-ancestor</K> — deny if any ancestor App is on a quarantine list.
        </li>
        <li>
          <K>require-direct-call</K> — refuse delegated calls for the most sensitive actions
          (writes, key rotation).
        </li>
      </ul>

      <h3 className="mt-8 font-display text-[22px] text-aegis-paper">Swarm-scoped approval</h3>
      <P>
        On the approve page, an operator can choose &ldquo;Approve for this agent and all current
        children (snapshot at &lt;ts&gt;)&rdquo;. The list of approved agent ids is materialized at
        approval time — children forked <em className="not-italic">after</em> the approval still
        require a fresh step-up. Never auto-extends.
      </P>

      <h3 className="mt-8 font-display text-[22px] text-aegis-paper">Walking the audit tree</h3>
      <P>
        Each receipt carries <K>parent_receipt_id</K>, so you can recursively unwind any chain:
      </P>
      <Code lang="bash">{`pnpm dlx @auto-nomos/audit-verify \\
  --chain writerReceipt.json \\
  --pubkey $AUDIT_VERIFY_KEY

# OK: 3 events, hash chain verified.
#
# ALLOW github://acme/app agent=planner  depth=0 id=8c1f…
# └── ALLOW github://acme/app agent=researcher depth=1 id=92ab…
#     └── STEPUP github://acme/app agent=writer depth=2 id=7fde…`}</Code>

      <Callout tone="warn">
        <strong className="text-aegis-paper">Beta:</strong> the wire format and Cedar templates are
        stable for one minor version. Federation across customers (cross-customer chains) is a
        design hook today (<K>swarms.crossCustomerEnabled</K>) but enforcement stays intra-customer
        until the federation contract ships.
      </Callout>
    </Section>
  );
}

function CloudIam() {
  return (
    <Section id="cloud" eyebrow="12 · runtime · preview" title="Cloud IAM — Azure, AWS, GCP.">
      <Callout tone="warn">
        <strong className="text-aegis-paper">Preview status (2026-05-15).</strong> Cloud federation
        code, Terraform modules, and dashboard wizards are merged on <K>main</K>, but the public
        OIDC issuer at <K>id.auto-nomos.com</K> is <strong>not deployed yet</strong> and there is no
        public mirror of the Terraform modules. This guide explains how to self-host the issuer and
        reference the modules from this repo so you can run end-to-end against a real cloud tenant
        today. Production-grade KMS-backed signing + the public mirror are coming with the first
        cloud GA release.
      </Callout>

      <P>
        Nomos brokers cloud the same way it brokers SaaS — except there is{' '}
        <em>no token to store</em>. We run an OIDC issuer; your cloud trusts it via federation; on
        every agent request we mint a fresh OIDC ID token and exchange it with the cloud&rsquo;s STS
        endpoint for a short-lived session credential (1–15 min TTL). Disconnect the cloud account
        in <K>/app/cloud</K> and the next call denies within a second.
      </P>
      <P>
        Three connectors ship in this preview: <K>azure</K> (AAD federated credential, JWT-bearer
        assertion), <K>aws</K> (IAM OIDC provider + <K>sts:AssumeRoleWithWebIdentity</K> + SigV4),{' '}
        <K>gcp</K> (Workload Identity Federation, STS exchange + service-account impersonation). All
        three reuse the same Cedar engine, the same UCAN audience, the same audit chain, and the
        same step-up flow as SaaS connectors.
      </P>

      <h3 className="mt-8 font-display text-[22px] text-aegis-paper">Mental model</h3>
      <Code lang="text">{`[ agent code ]
     │  authorize + apiCall
     ▼
[ PDP /v1/proxy ]                 ── Cedar + step-up + cloud risk-rules
     │  cloud_connection_id on UCAN meta
     ▼
[ CP /v1/internal/cloud/api-call/:id ]
     │  1. mint OIDC ID token (RS256)              → cloud.token.minted
     │  2. POST to AAD / STS / GCP-STS              → cloud.federation.exchanged
     │  3. signAndCall(session-creds, request)
     ▼  upstream cloud API call
[ PDP emits cloud.call.allowed audit + agent_span ]
[ swarm_id + parent_receipt_id + chain_depth carried end-to-end ]`}</Code>
      <P>
        The PDP owns the audit chain (single writer = no race). Mint + exchange events flow from CP
        back to PDP via an internal webhook so the three audit kinds land in the same hash chain.
        Every cloud call therefore appears in <K>/app/swarms/{`{id}`}</K> alongside SaaS calls —
        same ActionGraph, same Timeline, same BlastRadius.
      </P>

      <h3 className="mt-8 font-display text-[22px] text-aegis-paper">
        End-to-end setup — eight steps
      </h3>
      <P>
        Two roles are involved. <strong>Operator</strong> = the person running the Nomos control
        plane (Steps 1–3, done once per Nomos deployment). <strong>Customer</strong> = the cloud
        owner who wants their agent to reach into AWS / Azure / GCP (Steps 4–8, done once per cloud
        account). If you&rsquo;re self-hosting Nomos for your own org, you are both roles — run all
        eight in order.
      </P>

      <h4 className="mt-6 font-display text-[18px] text-aegis-paper">
        Step 1 — Operator: deploy the OIDC issuer
      </h4>
      <P>
        The issuer is a tiny Cloudflare Worker that exposes <K>/.well-known/openid-configuration</K>{' '}
        and <K>/jwks.json</K>. Source lives at <K>apps/oidc-issuer/</K> in this repo. Two preview
        paths:
      </P>
      <Code lang="bash">{`# A. Deploy to your own *.workers.dev subdomain (fastest preview):
cd apps/oidc-issuer
pnpm install
npx wrangler deploy
# → prints e.g. https://nomos-oidc.<your-account>.workers.dev

# B. Bind a custom domain (e.g. id.<your-company>.com) so AAD/STS/WIF accept it:
#   1. Cloudflare dashboard → Workers & Pages → your worker → Triggers → Custom domain
#   2. Add CNAME id.<your-company>.com → workers.dev hostname
#   3. Set CP env: OIDC_ISSUER_URL=https://id.<your-company>.com

# JWKS key material — for the preview, key-store.ts ships an in-memory dev signer.
# AWS KMS-backed signing is wired in apps/control-plane/src/oidc/kms-signer.ts; set
#   OIDC_KMS_KEY_REF=arn:aws:kms:us-east-1:<acct>:key/<id>
# on the control plane to use it (recommended before any prod use).`}</Code>
      <Callout tone="info">
        <strong className="text-aegis-paper">Why an OIDC issuer.</strong> AWS STS, Azure AD, and GCP
        WIF all accept ID tokens from any RFC 8414-compliant issuer URL whose JWKS validates. We
        don&rsquo;t need to host the issuer at <K>id.auto-nomos.com</K> for things to work — we need
        the issuer URL you set in CP env to be reachable from the cloud&rsquo;s STS. A{' '}
        <K>*.workers.dev</K> URL is fine for preview; a custom domain is recommended for any
        production deployment so it survives Cloudflare account changes.
      </Callout>

      <h4 className="mt-6 font-display text-[18px] text-aegis-paper">
        Step 2 — Operator: control-plane environment
      </h4>
      <Code lang="bash">{`# In your control-plane .env (or production secret store):
OIDC_ISSUER_URL=https://nomos-oidc.<your-account>.workers.dev
# Optional but recommended once you have AWS KMS provisioned:
OIDC_KMS_KEY_REF=arn:aws:kms:us-east-1:<acct>:key/<id>

# PDP webhook so cloud mint + exchange events land in the same audit chain.
# Use your PDP's public URL (Fly / Render / Cloud Run / your VM):
PDP_WEBHOOK_URLS=https://pdp.<your-host>/v1/internal/audit/emit-cloud
PDP_SERVICE_TOKEN=<shared-secret-between-cp-and-pdp>`}</Code>

      <h4 className="mt-6 font-display text-[18px] text-aegis-paper">
        Step 3 — Operator: apply migration 0028
      </h4>
      <P>
        Migration <K>0028_cloud_iam_m0</K> creates the <K>oidc_issuer_keys</K> and{' '}
        <K>cloud_connections</K> tables. Run drizzle-kit from the control plane:
      </P>
      <Code lang="bash">{`pnpm --filter @auto-nomos/control-plane db:migrate
# verify with:
psql "$DATABASE_URL" -c "\\dt cloud_connections oidc_issuer_keys"`}</Code>

      <h4 className="mt-6 font-display text-[18px] text-aegis-paper">
        Step 4 — Customer: get your customer_id from the dashboard
      </h4>
      <P>
        Log in, open <K>/app/settings/workspace</K> (or any page in the dashboard — your customer
        UUID is shown in the workspace card). Copy it; every Terraform module needs it because the
        federated identity subject is pinned to <K>customer/{`{cid}`}/agent/*</K>.
      </P>

      <h4 className="mt-6 font-display text-[18px] text-aegis-paper">
        Step 5 — Customer: generate the Terraform snippet
      </h4>
      <P>The Nomos CLI prints a paste-ready Terraform block per cloud. Install once:</P>
      <Code lang="bash">{`npm i -g @auto-nomos/cli
# or use the local repo binary directly:
#   pnpm --filter @auto-nomos/cli build && node packages/cli/dist/bin.js ...

nomos cloud install --azure --customer-id <your-customer-uuid> \\
  --subscription-id 00000000-0000-0000-0000-000000000000 > nomos.tf

nomos cloud install --aws --customer-id <your-customer-uuid> \\
  --aws-region us-east-1 > nomos.tf

nomos cloud install --gcp --customer-id <your-customer-uuid> \\
  --project-id my-prod-proj > nomos.tf`}</Code>
      <Callout tone="warn">
        <strong className="text-aegis-paper">No public Terraform mirror yet.</strong> The CLI
        currently emits a snippet that references{' '}
        <K>github.com/auto-nomos/terraform-{`{cloud}`}-nomos-bootstrap</K> — that repo does not
        exist yet. For preview, change the <K>source</K> line of the generated snippet to a local
        path that points at this repo&rsquo;s <K>infra/terraform/{`{cloud}`}-nomos-bootstrap/</K>{' '}
        directory, e.g.{' '}
        <K>source = &quot;../credential-broker/infra/terraform/azurerm-nomos-bootstrap&quot;</K>.
        Pin a commit SHA once you&rsquo;ve copied the module out into your own infra repo so nothing
        rolls forward without review.
      </Callout>

      <h4 className="mt-6 font-display text-[18px] text-aegis-paper">
        Step 6 — Customer: review and apply the Terraform
      </h4>
      <P>
        <strong>Read the module before applying.</strong> The three modules each create a tightly
        scoped IAM grant — defaults are intentionally read-only at the broadest documented scope.
      </P>
      <ul className="ml-6 list-disc space-y-1.5 marker:text-aegis-signal">
        <li>
          <strong className="text-aegis-paper">Azure</strong> (
          <K>infra/terraform/azurerm-nomos-bootstrap/</K>) — App Registration + Service Principal +
          Federated Identity Credential (issuer = your <K>OIDC_ISSUER_URL</K>, audience ={' '}
          <K>api://AzureADTokenExchange</K>, subject = <K>customer/{`{cid}`}/agent/*</K>) + Reader
          role assignment at subscription scope. Variables: <K>customer_id</K>,{' '}
          <K>subscription_id</K>, <K>nomos_oidc_issuer</K> (override default to your issuer URL),{' '}
          <K>resource_group_name</K> (narrow to one RG).
        </li>
        <li>
          <strong className="text-aegis-paper">AWS</strong> (
          <K>infra/terraform/aws-nomos-bootstrap/</K>) — IAM OIDC provider trusting your issuer +
          IAM role with <K>sts:AssumeRoleWithWebIdentity</K> trust keyed on{' '}
          <K>sub == customer/{`{cid}`}/agent/*</K> + <K>aws:iam::aws:policy/ReadOnlyAccess</K>{' '}
          attached. Variables: <K>customer_id</K>, <K>region</K>, <K>nomos_oidc_issuer</K>,{' '}
          <K>managed_policy_arns</K>, <K>additional_policy_json</K> (narrow further).
        </li>
        <li>
          <strong className="text-aegis-paper">GCP</strong> (
          <K>infra/terraform/google-nomos-bootstrap/</K>) — Workload Identity Pool + OIDC Provider
          (with <K>attribute.customer == &quot;{`{cid}`}&quot;</K> condition so cross-customer cred
          sharing is impossible) + service account granted <K>roles/viewer</K> + impersonation IAM
          binding. Variables: <K>customer_id</K>, <K>project_id</K>, <K>nomos_oidc_issuer</K>,
          <K>service_account_roles</K>.
        </li>
      </ul>
      <Code lang="bash">{`terraform init
terraform plan          # READ this carefully — it shows exactly what IAM lands
terraform apply
terraform output paste_into_nomos_dashboard
# {
#   "app_object_id"   = "..."
#   "app_client_id"   = "..."
#   "tenant_id"       = "..."
#   "subscription_id" = "..."
# }`}</Code>

      <h4 className="mt-6 font-display text-[18px] text-aegis-paper">
        Step 7 — Customer: paste outputs into the dashboard
      </h4>
      <P>
        Open <K>/app/cloud</K>, click the connector card (Azure / AWS / GCP), and paste each
        Terraform output into the matching field. The wizard calls <K>cloudConnections.create</K> on
        the control plane, kicks off a verify probe, and redirects you to the list view. Watch the
        status badge flip from <K>pending</K> to <K>verified</K> — that means we successfully minted
        an ID token, exchanged it with the cloud&rsquo;s STS, and made a real probe call.
      </P>
      <ul className="ml-6 list-disc space-y-1.5 marker:text-aegis-signal">
        <li>
          Azure: <K>app_object_id</K>, <K>app_client_id</K>, <K>tenant_id</K>,{' '}
          <K>subscription_id</K>.
        </li>
        <li>
          AWS: <K>role_arn</K>, <K>account_id</K>, <K>region</K>.
        </li>
        <li>
          GCP: <K>wif_provider</K>, <K>service_account_email</K>, <K>project_id</K>.
        </li>
      </ul>

      <h4 className="mt-6 font-display text-[18px] text-aegis-paper">
        Step 8 — Customer: write a Cedar policy and make the first call
      </h4>
      <P>
        Go to <K>/app/policies</K>, click <strong>New policy</strong>, attach it to your app, and
        paste something narrow — for example, allow only resource-group listing in one Azure
        subscription:
      </P>
      <Code lang="cedar">{`permit (
  principal,
  action == Action::"/azure/resource_groups/list",
  resource
) when {
  resource.subscription_id == "00000000-0000-0000-0000-000000000000"
};`}</Code>
      <P>
        Mint a UCAN (dashboard <strong>Apps → API keys → Mint UCAN</strong> or via SDK), making sure{' '}
        <K>meta.cloud_connection_id</K> is the UUID of the row you just created. Then your agent /
        curl works end-to-end:
      </P>
      <Code lang="bash">{`curl -s https://pdp.<your-host>/v1/proxy \\
  -H "authorization: Bearer $UCAN" \\
  -H "content-type: application/json" \\
  -d '{
    "action": "/azure/resource_groups/list",
    "resource": { "subscription_id": "00000000-..." },
    "apiCall": {
      "method": "GET",
      "path": "/subscriptions/00000000-.../resourcegroups?api-version=2021-04-01"
    }
  }'
# → 200 OK with the upstream ARM response.
# Open /app/audit — three cloud rows linked to one receipt id.`}</Code>

      <h3 className="mt-10 font-display text-[22px] text-aegis-paper">
        Permissions — three layers, in order
      </h3>
      <ol className="ml-6 list-decimal space-y-2 marker:text-aegis-signal">
        <li>
          <strong className="text-aegis-paper">Cloud-side IAM grant</strong> — what the Terraform
          module attaches to the federated identity. Narrow it: Reader at RG scope (Azure),{' '}
          <K>s3:GetObject</K> on one bucket (AWS), <K>roles/storage.objectViewer</K> on one project
          (GCP). The federated identity can never do more than your cloud IAM allows — this is your
          hard ceiling.
        </li>
        <li>
          <strong className="text-aegis-paper">Cedar policy</strong> — what the agent may ask the
          PDP for. Strictly narrows the IAM grant; carries context-aware rules (time, depth,
          resource attrs) that the cloud language can&rsquo;t express.
        </li>
        <li>
          <strong className="text-aegis-paper">UCAN capability</strong> — the time-bound, app-bound
          capability presented per call. Always a subset of policy. Revoke → next call denies within
          ~1s via the push channel.
        </li>
      </ol>
      <P>
        Effective permission = intersection of all three. Inside a swarm, add a fourth: chain
        attenuation (each child ⊆ parent).
      </P>

      <h3 className="mt-8 font-display text-[22px] text-aegis-paper">More Cedar examples</h3>
      <Code lang="cedar">{`// AWS: pin to one account, scope to one bucket.
permit (principal,
        action == Action::"/aws/s3/list_objects",
        resource)
when {
  resource.account_id == "123456789012" &&
  resource.bucket == "acme-reports"
};

// Azure: allow VM reads, force cosigner on every destructive verb.
forbid (principal,
        action in [Action::"/azure/vm/delete", Action::"/azure/vm/stop"],
        resource)
unless { context.cosigner_present == true };

// GCP: lock the whole pack to one project.
permit (principal, action like "/gcp/*", resource)
when { resource.project_id == "my-prod-proj" };`}</Code>
      <Callout tone="warn">
        <strong className="text-aegis-paper">Defense-in-depth.</strong> Even if Cedar would{' '}
        <K>permit</K> without a cosigner clause, the PDP&rsquo;s <K>cloud-risk-rules</K> service
        force-injects cosigner-required on every destructive verb (<K>delete</K>, <K>stop</K>,{' '}
        <K>drain</K>, <K>scale_down</K>, <K>rotate</K>, <K>redeploy</K>, <K>run_command</K>,{' '}
        <K>invoke</K>, <K>terminate</K>). You cannot accidentally deploy an over-permissive policy
        that bypasses step-up on destruction.
      </Callout>

      <h3 className="mt-8 font-display text-[22px] text-aegis-paper">Action catalog</h3>
      <P>
        Each pack curates first-class typed actions plus a <K>raw_call</K> escape hatch for anything
        not yet typed. Full lists live in{' '}
        <K>packages/schema-packs/src/{`{azure,aws,gcp}`}/actions.ts</K>.
      </P>
      <ul className="ml-6 list-disc space-y-1.5 marker:text-aegis-signal">
        <li>
          <strong className="text-aegis-paper">azure</strong> — subscriptions, resource_groups,
          resources, vm (list, get, start, stop, restart, delete, run_command), vmss, aks,
          storage_accounts, blob_containers, key_vaults (metadata only), app_services, acr, metrics.{' '}
          <K>/azure/raw_call</K> escape hatch.
        </li>
        <li>
          <strong className="text-aegis-paper">aws</strong> — sts:get_caller_identity, ec2 (list,
          start, stop, terminate), s3 (buckets, objects), lambda (list, invoke), iam (list_*), rds
          (describe, reboot), cloudwatch, cost_explorer. <K>/aws/raw_call</K>.
        </li>
        <li>
          <strong className="text-aegis-paper">gcp</strong> — cloudresourcemanager.projects.list,
          compute.instances (list, get, start, stop, delete), storage (buckets, objects), bigquery,
          cloudfunctions, iam.serviceaccounts, monitoring, logging. <K>/gcp/raw_call</K>.
        </li>
      </ul>

      <h3 className="mt-8 font-display text-[22px] text-aegis-paper">raw_call escape hatch</h3>
      <P>
        First use of a new <K>(host, path_prefix)</K> tuple per customer always cosigns even if
        Cedar would <K>permit</K> outright — the PDP keeps a seen-tuples sticky bit per workspace.
        Add a tuple by approving it once via step-up.
      </P>
      <Code lang="cedar">{`permit (principal, action == Action::"/azure/raw_call", resource)
when {
  resource.method == "GET" &&
  resource.host == "management.azure.com" &&
  resource.path_prefix in ["/subscriptions", "/providers/Microsoft.Compute"] &&
  context.cosigner_present == true
};`}</Code>

      <h3 className="mt-8 font-display text-[22px] text-aegis-paper">Audit + observability</h3>
      <P>
        Every cloud call lands as <strong>three</strong> audit rows (<K>cloud.token.minted</K>,{' '}
        <K>cloud.federation.exchanged</K>, <K>cloud.call.allowed</K>) plus <strong>one</strong>{' '}
        <K>agent_spans</K> row. All four carry <K>swarm_id</K>, <K>parent_receipt_id</K>,{' '}
        <K>chain_depth</K>, and (on <K>cloud.call</K>) <K>api_call_method</K> + <K>api_call_path</K>{' '}
        — so a delegated cloud call from a deep swarm node walks back to its root receipt the same
        way a SaaS call would.
      </P>
      <P>
        Visit <K>/app/swarms/{`{id}`}</K> after a cloud call: the ActionGraph + ActionTimeline
        surface cloud spans alongside OAuth spans. The Audit drawer renders the cloud row with
        method + path columns so resource_mismatch grep works without a jsonb scan.
      </P>

      <h3 className="mt-8 font-display text-[22px] text-aegis-paper">
        Verify-poll worker (drift detection)
      </h3>
      <P>
        A 24-hour timer probes every <K>verified</K> connection (Azure: <K>subscriptions.get</K>,
        AWS: <K>sts:GetCallerIdentity</K>, GCP: <K>cloudresourcemanager:projects.get</K>).
        Two-strike rule for retryable failures; non-retryable (role removed) flips to <K>broken</K>{' '}
        immediately. Revert your Terraform-managed role by hand → the dashboard shows broken within
        24 hours. The <K>Verify now</K> button in <K>/app/cloud</K> runs the same probe on demand.
      </P>

      <h3 className="mt-8 font-display text-[22px] text-aegis-paper">Step-up + chain snapshots</h3>
      <P>
        Identical to SaaS. Cedar or <K>cloud-risk-rules</K> mark the call requiresStepUp → PDP
        returns 403 <K>cosigner_required</K> → operator approves via push or <K>/app/approvals</K> →
        agent retries with cosigner UCAN → allow. For multi-agent swarms, the snapshot approval from{' '}
        <K>/app/swarms/{`{id}`}</K> covers every cloud call from any agent in the snapshot for the
        TTL, no matter the depth.
      </P>

      <h3 className="mt-8 font-display text-[22px] text-aegis-paper">
        Egress proxy — defense-in-depth gate
      </h3>
      <P>
        Set <K>EGRESS_PROXY_REQUIRE_TOKEN_FOR_CLOUDS=1</K> on the egress proxy and it refuses
        CONNECTs to <K>*.amazonaws.com</K> / <K>management.azure.com</K> / <K>*.googleapis.com</K>{' '}
        without a PDP-issued proxy-authorization token. W3C <K>traceparent</K> passes through so
        egress observations link back to the PDP audit row via trace ID.
      </P>

      <h3 className="mt-8 font-display text-[22px] text-aegis-paper">Troubleshooting</h3>
      <ul className="ml-6 list-disc space-y-2 marker:text-aegis-signal">
        <li>
          <strong className="text-aegis-paper">
            Wizard hangs at <K>pending</K>:
          </strong>{' '}
          run <K>Verify now</K>. If still pending, the cloud&rsquo;s STS cannot reach your issuer
          URL — confirm the URL in CP env matches the issuer you deployed, and that{' '}
          <K>/.well-known/openid-configuration</K> is publicly reachable (curl from a fresh
          machine).
        </li>
        <li>
          <strong className="text-aegis-paper">
            <K>cloud.federation.exchanged.failed</K> with <K>InvalidIdentityToken</K> (AWS):
          </strong>{' '}
          AWS caches the OIDC thumbprint at IAM-provider create time. If you rotated the issuer TLS
          cert, re-run <K>terraform apply</K> on the bootstrap module to refresh{' '}
          <K>aws_iam_openid_connect_provider.thumbprint_list</K>.
        </li>
        <li>
          <strong className="text-aegis-paper">
            Azure <K>AADSTS70021</K>:
          </strong>{' '}
          subject mismatch. The federated credential subject must be{' '}
          <K>customer/{`{cid}`}/agent/*</K> (wildcard); legacy subjects without the wildcard work
          for one agent only. Re-run terraform with the latest module.
        </li>
        <li>
          <strong className="text-aegis-paper">
            GCP <K>invalid_grant</K>:
          </strong>{' '}
          WIF attribute condition rejects the token. Verify <K>attribute.customer</K> in the
          provider matches your customer UUID exactly (case-sensitive).
        </li>
        <li>
          <strong className="text-aegis-paper">
            Call returns 403 <K>cosigner_required</K>:
          </strong>{' '}
          intended — your action hit the destructive-verbs allowlist in <K>cloud-risk-rules</K> or
          your Cedar marked it. Approve once at <K>/app/approvals</K> or via Telegram and retry.
        </li>
      </ul>

      <h3 className="mt-8 font-display text-[22px] text-aegis-paper">
        What&rsquo;s still preview vs. GA
      </h3>
      <ul className="ml-6 list-disc space-y-1.5 marker:text-aegis-signal">
        <li>
          <strong className="text-aegis-paper">Preview today:</strong> issuer hosted at{' '}
          <K>id.auto-nomos.com</K> (use your own Worker URL for now); public mirror of Terraform
          modules at <K>github.com/auto-nomos/terraform-*</K>; in-cloud sidecar variant (
          <K>--in-cloud</K>) — module emits a snippet, no production module yet.
        </li>
        <li>
          <strong className="text-aegis-paper">Stable wire format:</strong>{' '}
          <K>cloudConnections.create</K> input shape, the three audit kinds, UCAN{' '}
          <K>meta.cloud_connection_id</K>, the raw_call seen-tuples semantics. New typed actions
          land additively and never break older clients.
        </li>
      </ul>
    </Section>
  );
}

function Sdk() {
  return (
    <Section id="sdk" eyebrow="13 · integrate" title="SDK & MCP.">
      <P>
        The TypeScript SDK ships as <K>@auto-nomos/sdk</K>. Three primary surfaces:{' '}
        <K>createIntentClient()</K> for dynamic-mode agents, <K>createAuthorize()</K> for
        static-mode, and <K>Disposable Grant</K> for {`{ using }`} scope. The chain helpers{' '}
        <K>forkChild()</K> + <K>readParentChainFromEnv()</K> live in the same package.
      </P>
      <P>
        Python parity ships as <K>nomos</K> on PyPI plus the <K>nomos-ucan</K> Bun-compiled binary (
        <K>mint</K> / <K>fork</K> / <K>validate</K> / <K>parse</K>). LangGraph and CrewAI examples
        are under <K>examples/langgraph-nomos/</K> and <K>examples/crewai-nomos/</K>.
      </P>
      <P>
        For Claude Desktop / Claude Code, the broker ships an MCP server wrapper at{' '}
        <K>@auto-nomos/mcp-server</K>. Reference MCPs live in <K>examples/</K>: <K>mcp-github</K>{' '}
        (static), <K>mcp-github-dynamic</K> (intent flow), <K>mcp-filesystem</K> (filesystem
        provider), and <K>claude-subagents-nomos</K> (sub-agent chain).
      </P>
    </Section>
  );
}

function TelegramSetup() {
  return (
    <Section id="telegram" eyebrow="14 · integrate" title="Telegram notifications.">
      <P>
        Nomos can push step-up approval prompts to your Telegram account. When an agent triggers a
        high-risk action you&rsquo;ll get a message with{' '}
        <strong className="text-aegis-paper">Approve</strong> /{' '}
        <strong className="text-aegis-paper">Deny</strong> buttons — no dashboard tab required.
      </P>

      <ol className="ml-0 list-none space-y-4">
        <Step n="01" title="Find your chat ID">
          Open{' '}
          <a
            href="https://t.me/autonomosagent_bot"
            target="_blank"
            rel="noreferrer"
            className="text-aegis-signal hover:underline"
          >
            @autonomosagent_bot
          </a>{' '}
          in Telegram and send <K>/start</K>. The bot replies with your numeric chat ID (e.g.{' '}
          <K>1234567890</K>).
        </Step>
        <Step n="02" title="Enable in the dashboard">
          Go to{' '}
          <Link href="/app/settings/notifications" className="text-aegis-signal hover:underline">
            Settings → Notifications
          </Link>
          , check <K>Telegram</K>, paste your chat ID, and click <K>Save</K>.
        </Step>
        <Step n="03" title="Test it">
          Trigger a high-risk action (or use a policy that always step-ups). You should receive a
          Telegram message within seconds. Tap <K>✓ Approve</K> — the agent call proceeds.
        </Step>
      </ol>

      <Callout tone="info">
        <strong className="text-aegis-paper">Deep links:</strong> The bot also supports a one-click
        linking flow. From the dashboard, a Link button will generate a short-lived deep link that
        automatically pairs your account without copying a chat ID.
      </Callout>

      <Callout tone="warn">
        Telegram taps grant <em className="not-italic">soft approval</em> — they resolve the step-up
        for low and medium-sensitivity actions. High-sensitivity actions (marked{' '}
        <K>cosigner_required</K> in the policy) additionally require a passkey tap in the browser.
      </Callout>

      <Code lang="shell">{`# Verify the bot is configured on the control plane
# (requires TELEGRAM_BOT_TOKEN in your .env)
nomos status`}</Code>
    </Section>
  );
}

function Faq() {
  return (
    <Section id="faq" eyebrow="15 · reference" title="FAQ.">
      <Faqs
        items={[
          [
            'Can the agent ever see the OAuth token?',
            'No. Tokens are decrypted in the control plane only. The PDP receives the raw token from the control plane on each authorized request and uses it to make the upstream call. The agent gets a sanitized response back.',
          ],
          [
            'What happens if the LLM verifier is down?',
            'It fails closed. The intent is denied and falls through to step-up. Same posture as the SDK’s default behavior when the PDP is unreachable.',
          ],
          [
            'Can I run Nomos on the customer edge?',
            'Yes. The PDP ships as a Docker image and Helm chart. Run it inside the customer VPC; the control plane stays managed.',
          ],
          [
            'How do I revoke a UCAN?',
            'Either revoke its envelope on the agent’s detail page (revokes all children silently within 5s via the push channel) or revoke a specific cid via the UCANs router.',
          ],
          [
            'Is there a Python SDK?',
            'Yes — `pip install nomos`. UCAN minting shells out to the `nomos-ucan` Bun-compiled binary so you get the same crypto path as TypeScript. LangGraph and CrewAI examples ship under `examples/`.',
          ],
          [
            'How deep can a delegation chain go?',
            'Default cap is 8 (NOMOS_MAX_CHAIN_DEPTH, env-overridable). PDP rejects with `chain_too_deep` and `forkChild()` refuses to construct a deeper chain client-side.',
          ],
          [
            'Does a child agent inherit the parent’s scope automatically?',
            'No — UCAN attenuation is monotonic. A child can only narrow the parent’s capability, never broaden it. The PDP computes an `attenuation_summary` (capability_lost, resources_narrowed) on every chain request.',
          ],
        ]}
      />
    </Section>
  );
}

function Faqs({ items }: { items: [string, string][] }) {
  return (
    <ul className="space-y-3">
      {items.map(([q, a]) => (
        <li
          key={q}
          className="overflow-hidden rounded-sm border border-aegis-line bg-aegis-surface"
        >
          <details className="group">
            <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 font-medium text-aegis-paper transition-colors hover:bg-aegis-surface-2">
              {q}
              <span className="font-mono text-xl text-aegis-signal transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <div className="border-t border-aegis-line bg-aegis-surface-2 px-5 py-4 text-[14px] leading-relaxed text-aegis-mute">
              {a}
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}

/* ─── Step block ──────────────────────────────────────────────────────── */

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[44px_minmax(0,1fr)] gap-4 border-l border-aegis-line pl-4">
      <span className="font-display text-2xl leading-none text-aegis-signal">{n}</span>
      <div>
        <div className="font-medium text-aegis-paper">{title}</div>
        <div className="mt-1 text-[14px] text-aegis-mute">{children}</div>
      </div>
    </li>
  );
}

/* ─── Diagrams ────────────────────────────────────────────────────────── */

/* ─── Per-topic export ─────────────────────────────────────────────────── */

export type TopicId =
  | 'what-is-nomos'
  | 'mental-model'
  | 'quickstart'
  | 'connections'
  | 'apps'
  | 'policies'
  | 'filesystem-ssh'
  | 'dynamic-intent'
  | 'step-up'
  | 'standing-grants'
  | 'audit'
  | 'swarms'
  | 'cloud'
  | 'sdk'
  | 'telegram'
  | 'faq';

const TOPIC_COMPONENTS: Record<TopicId, React.ComponentType> = {
  'what-is-nomos': WhatIsNomos,
  'mental-model': MentalModel,
  quickstart: Quickstart,
  connections: Connections,
  apps: Apps,
  policies: Policies,
  'filesystem-ssh': FilesystemSsh,
  'dynamic-intent': DynamicIntent,
  'step-up': StepUp,
  'standing-grants': StandingGrants,
  audit: AuditChain,
  swarms: Swarms,
  cloud: CloudIam,
  sdk: Sdk,
  telegram: TelegramSetup,
  faq: Faq,
};

export function GuideTopic({ topic }: { topic: TopicId }) {
  const idx = SECTIONS.findIndex((s) => s.id === topic);
  const prev = idx > 0 ? SECTIONS[idx - 1] : null;
  const next = idx < SECTIONS.length - 1 ? SECTIONS[idx + 1] : null;
  const TopicContent = TOPIC_COMPONENTS[topic];

  return (
    <div className="mx-auto max-w-[1280px]">
      <div className="mt-4 grid grid-cols-12 gap-10">
        <GuideNav sections={SECTIONS} activeTopic={topic} />
        <article className="col-span-12 max-w-[680px] lg:col-span-7">
          <TopicContent />
          <div className="mt-10 flex items-center justify-between border-t border-aegis-line pt-6">
            {prev ? (
              <Link
                href={`/app/guide/${prev.id}`}
                className="flex items-center gap-2 font-mono text-xs text-aegis-mute transition-colors hover:text-aegis-paper"
              >
                ← {prev.label}
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link
                href={`/app/guide/${next.id}`}
                className="flex items-center gap-2 font-mono text-xs text-aegis-mute transition-colors hover:text-aegis-paper"
              >
                {next.label} →
              </Link>
            ) : (
              <span />
            )}
          </div>
        </article>
        <RightRail />
      </div>
    </div>
  );
}

function GuideNav({ sections, activeTopic }: { sections: Section[]; activeTopic: string }) {
  const groups = sections.reduce<Record<string, Section[]>>((acc, s) => {
    const key = s.group ?? 'More';
    (acc[key] = acc[key] ?? []).push(s);
    return acc;
  }, {});
  return (
    <nav className="col-span-12 lg:col-span-3 lg:sticky lg:top-24 lg:self-start">
      <div className="eyebrow mb-3">contents</div>
      {Object.entries(groups).map(([label, items]) => (
        <div key={label} className="mb-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
            {label}
          </div>
          <ul className="mt-2 space-y-1">
            {items.map((s) => {
              const isActive = activeTopic === s.id;
              return (
                <li key={s.id}>
                  <Link
                    href={`/app/guide/${s.id}`}
                    className={cn(
                      'group flex items-center gap-2 border-l border-aegis-line py-1.5 pl-3 text-sm transition-colors',
                      isActive
                        ? 'border-aegis-signal text-aegis-paper'
                        : 'text-aegis-mute hover:border-aegis-line-strong hover:text-aegis-paper',
                    )}
                  >
                    {s.icon ? (
                      <s.icon
                        className={cn(
                          'h-3.5 w-3.5',
                          isActive ? 'text-aegis-signal' : 'text-aegis-faint',
                        )}
                      />
                    ) : null}
                    {s.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/* ─── Diagrams ────────────────────────────────────────────────────────── */

function DiagramFlow() {
  return (
    <figure className="my-3 overflow-hidden rounded-sm border border-aegis-line bg-aegis-surface-2 p-6">
      <svg
        viewBox="0 0 720 220"
        className="w-full"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Nomos request flow"
      >
        <title>Nomos request flow</title>
        <defs>
          <marker
            id="arr"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--aegis-signal))" />
          </marker>
        </defs>

        {[
          { x: 30, label: 'Agent', sub: 'SDK' },
          { x: 200, label: 'Control plane', sub: 'mints UCAN' },
          { x: 380, label: 'PDP', sub: 'cedar gate' },
          { x: 560, label: 'SaaS API', sub: 'upstream' },
        ].map((node) => (
          <g key={node.label}>
            <rect
              x={node.x}
              y="60"
              width="140"
              height="80"
              fill="hsl(var(--aegis-ink))"
              stroke="hsl(var(--aegis-line-strong))"
            />
            <text
              x={node.x + 70}
              y="98"
              textAnchor="middle"
              fontFamily="var(--font-display)"
              fontSize="18"
              fill="hsl(var(--aegis-paper))"
            >
              {node.label}
            </text>
            <text
              x={node.x + 70}
              y="118"
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontSize="10"
              letterSpacing="2"
              fill="hsl(var(--aegis-mute))"
            >
              {node.sub.toUpperCase()}
            </text>
          </g>
        ))}

        {/* arrows between nodes */}
        {[
          [170, 200, 'intent'],
          [340, 380, 'mint'],
          [520, 560, 'proxy'],
        ].map(([a, b, label]) => (
          <g key={label as string}>
            <line
              x1={a as number}
              y1="100"
              x2={b as number}
              y2="100"
              stroke="hsl(var(--aegis-signal))"
              strokeWidth="1.5"
              markerEnd="url(#arr)"
            />
            <text
              x={((a as number) + (b as number)) / 2}
              y="92"
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontSize="10"
              letterSpacing="2"
              fill="hsl(var(--aegis-signal))"
            >
              {(label as string).toUpperCase()}
            </text>
          </g>
        ))}

        <text
          x="360"
          y="195"
          textAnchor="middle"
          fontFamily="var(--font-mono)"
          fontSize="10"
          letterSpacing="2"
          fill="hsl(var(--aegis-faint))"
        >
          AUDIT CHAIN ← EVERY DECISION LANDS HERE
        </text>
        <line
          x1="100"
          y1="170"
          x2="630"
          y2="170"
          stroke="hsl(var(--aegis-iris))"
          strokeWidth="1"
          strokeDasharray="3 4"
        />
      </svg>
    </figure>
  );
}

function DiagramStepUp() {
  return (
    <figure className="my-3 overflow-hidden rounded-sm border border-aegis-line bg-aegis-surface-2 p-6">
      <svg
        viewBox="0 0 720 200"
        className="w-full"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Step-up sequence"
      >
        <title>Step-up sequence</title>
        {[
          { x: 30, label: '1 deny', tone: 'coral' },
          { x: 180, label: '2 push', tone: 'amber' },
          { x: 330, label: '3 passkey', tone: 'iris' },
          { x: 480, label: '4 cosigner', tone: 'signal' },
          { x: 600, label: '5 retry → allow', tone: 'signal' },
        ].map((step) => (
          <g key={step.label}>
            <rect
              x={step.x}
              y="50"
              width="120"
              height="100"
              fill="hsl(var(--aegis-ink))"
              stroke={`hsl(var(--aegis-${step.tone}))`}
              strokeWidth="1.4"
            />
            <text
              x={step.x + 60}
              y="105"
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontSize="11"
              letterSpacing="2"
              fill={`hsl(var(--aegis-${step.tone}))`}
            >
              {step.label.toUpperCase()}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
}
