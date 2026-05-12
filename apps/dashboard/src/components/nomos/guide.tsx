'use client';

import {
  ArrowDownToLine,
  Boxes,
  Cpu,
  FileLock2,
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
  { id: 'dynamic-intent', label: 'Dynamic intent', group: 'Runtime', icon: Workflow },
  { id: 'step-up', label: 'Step-up & passkeys', group: 'Runtime', icon: ShieldAlert },
  { id: 'standing-grants', label: 'Standing grants', group: 'Runtime', icon: Layers },
  { id: 'audit', label: 'Audit chain', group: 'Runtime', icon: Hash },
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
          <DynamicIntent />
          <StepUp />
          <StandingGrants />
          <AuditChain />
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
        A reading guide to the platform. Thirteen short sections — read top to bottom for
        orientation, or jump from the table of contents on the left. Code snippets are copy-paste
        ready.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-aegis-faint">
        <span>~12 min read</span>
        <span aria-hidden>·</span>
        <span>last updated 2026-05-11</span>
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
        Slack, Google (Drive + Calendar), Notion, Linear, and Stripe Connect. Filesystem and
        additional providers plug in via the same adapter contract.
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

function DynamicIntent() {
  return (
    <Section id="dynamic-intent" eyebrow="07 · runtime" title="Dynamic intent.">
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
    <Section id="step-up" eyebrow="08 · runtime" title="Step-up & passkeys.">
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
    <Section id="standing-grants" eyebrow="09 · runtime" title="Standing grants.">
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
    <Section id="audit" eyebrow="10 · runtime" title="Audit chain.">
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

function Sdk() {
  return (
    <Section id="sdk" eyebrow="11 · integrate" title="SDK & MCP.">
      <P>
        The TypeScript SDK ships as <K>@auto-nomos/sdk</K>. Three primary surfaces:{' '}
        <K>createIntentClient()</K> for dynamic-mode agents, <K>createAuthorize()</K> for
        static-mode, and <K>Disposable Grant</K> for {`{ using }`} scope.
      </P>
      <P>
        For Claude Desktop / Claude Code, the broker ships an MCP server wrapper at{' '}
        <K>@auto-nomos/mcp-server</K>. Three example MCPs live in <K>examples/</K>:{' '}
        <K>mcp-github</K> (static), <K>mcp-github-dynamic</K> (intent flow), and{' '}
        <K>mcp-filesystem</K> (filesystem provider).
      </P>
    </Section>
  );
}

function TelegramSetup() {
  return (
    <Section id="telegram" eyebrow="12 · integrate" title="Telegram notifications.">
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
    <Section id="faq" eyebrow="13 · reference" title="FAQ.">
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
            'Is there a non-TS SDK?',
            'Not yet. Public roadmap: Python, then Go. Until then any HTTP client can call /v1/intent and /v1/proxy directly.',
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
  | 'dynamic-intent'
  | 'step-up'
  | 'standing-grants'
  | 'audit'
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
  'dynamic-intent': DynamicIntent,
  'step-up': StepUp,
  'standing-grants': StandingGrants,
  audit: AuditChain,
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
