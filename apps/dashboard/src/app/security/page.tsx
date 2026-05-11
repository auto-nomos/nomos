import {
  CheckCircle2,
  Database,
  FileLock2,
  Hash,
  KeyRound,
  Lock,
  ShieldCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { PublicShell } from '../../components/nomos/public-shell';

/* Security & trust posture page. Long-form, scannable. Sections:
     · Pillars (cryptography, tenancy, audit, secrets)
     · Crypto stack (specific primitives + libraries)
     · Threat-model summary
     · Compliance posture
     · Reporting */

export const metadata = {
  title: 'Security · Nomos',
  description:
    'How Nomos handles cryptography, tenancy, secrets, and auditability. Trust posture written in plain language.',
};

export default function SecurityPage() {
  return (
    <PublicShell>
      <Hero />
      <Pillars />
      <CryptoStack />
      <Threat />
      <Compliance />
      <Reporting />
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
            <span>trust posture · 2026-05-11</span>
          </div>
          <h1 className="display mt-7 max-w-[14ch] text-[64px] leading-[0.95] text-aegis-paper md:text-[88px]">
            Security that
            <br />
            an <em>auditor</em> can read.
          </h1>
          <p className="mt-7 max-w-[640px] text-base leading-relaxed text-aegis-mute md:text-lg">
            Plain-language posture statement. We tell you which primitives we use, where they live,
            what we store, and what we don&rsquo;t. If something is missing here, assume the answer
            is <em>&ldquo;not yet&rdquo;</em>.
          </p>
        </div>
        <aside className="hidden lg:col-span-4 lg:block">
          <div className="corners relative rounded-sm border border-aegis-line bg-aegis-surface/40 p-7">
            <div className="eyebrow">at a glance</div>
            <ul className="mt-5 space-y-3 text-sm text-aegis-paper">
              <Glance>UCAN delegation (no shared secrets)</Glance>
              <Glance>Cedar policy — formally verified language</Glance>
              <Glance>Hash-chained audit + Ed25519 signed roots</Glance>
              <Glance>WebAuthn passkey for step-up + cosigner</Glance>
              <Glance>Cross-tenant invariants tested every release</Glance>
              <Glance>OAuth tokens encrypted at rest (XChaCha20)</Glance>
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}

function Glance({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-aegis-signal" />
      <span>{children}</span>
    </li>
  );
}

function Pillars() {
  const pillars = [
    {
      icon: KeyRound,
      title: 'Credentials never leave the broker.',
      body: 'Agents receive UCANs scoped to one action, one resource, one minute. The actual OAuth bearer is held by the PDP and used only for the authorized upstream call.',
    },
    {
      icon: FileLock2,
      title: 'Policy is enforced before the call.',
      body: 'Cedar policies run on every request. The PDP refuses to mint a UCAN if any active policy denies. Visual edits round-trip through the parser before save — no drift.',
    },
    {
      icon: ShieldCheck,
      title: 'Step-up by default for high-stakes actions.',
      body: 'Two-pass detection in the cedar engine flags risky calls. Nomos pushes a passkey prompt; only an authenticator-signed cosigner UCAN can release the action.',
    },
    {
      icon: Hash,
      title: 'Every decision is replayable.',
      body: 'Hash-chained audit_events; daily Ed25519 signed roots; Cloudflare R2 Parquet archive on a 7-year lifecycle; open-source CLI verifier you can run offline.',
    },
    {
      icon: Users,
      title: 'Multi-tenant by construction.',
      body: 'Every Drizzle query in tenant-scoped code is filtered on customer_id. A cross-tenant integration test runs on every CI to fail loudly if invariant breaks.',
    },
    {
      icon: Database,
      title: 'Encrypted secrets at rest.',
      body: 'OAuth refresh tokens are encrypted with XChaCha20-Poly1305. Encryption keys live in env, separate from DB credentials. Daily Ed25519 signing keys live in env too.',
    },
  ];
  return (
    <section className="mx-auto max-w-[1280px] px-6 py-24 md:px-10 md:py-32">
      <div className="mb-14">
        <div className="eyebrow">six pillars</div>
        <h2 className="display mt-4 text-[48px] text-aegis-paper">
          What we built into the runtime.
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-px bg-aegis-line md:grid-cols-2 lg:grid-cols-3">
        {pillars.map((p) => (
          <article
            key={p.title}
            className="bg-aegis-ink p-8 transition-colors hover:bg-aegis-surface/60"
          >
            <p.icon className="h-6 w-6 text-aegis-signal" />
            <h3 className="display mt-5 text-[22px] leading-tight text-aegis-paper">{p.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-aegis-mute">{p.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function CryptoStack() {
  const rows = [
    ['UCAN delegation', 'EdDSA (Ed25519) over @noble/ed25519', '@auto-nomos/crypto'],
    ['Token encryption', 'XChaCha20-Poly1305 via @noble/ciphers', 'OAUTH_TOKEN_ENCRYPTION_KEY env'],
    ['Audit signing', 'Ed25519 signature over canonicalized chain head', 'AUDIT_SIGN_KEY env'],
    ['Step-up cosigner', 'WebAuthn assertion → cosigner UCAN', 'browser authenticator'],
    ['Random IDs', 'crypto.randomUUID via @noble fallback', '@auto-nomos/crypto'],
    ['Hash chain', 'SHA-256 over canonicalized payload + prev hash', 'audit_events.hash column'],
  ];
  return (
    <section className="border-y border-aegis-line bg-aegis-surface/30">
      <div className="mx-auto max-w-[1280px] px-6 py-24 md:px-10">
        <div className="mb-12">
          <div className="eyebrow">crypto stack</div>
          <h2 className="display mt-4 text-[40px] text-aegis-paper">What does what.</h2>
          <p className="mt-4 max-w-[600px] text-sm text-aegis-mute">
            Every cryptographic operation goes through{' '}
            <code className="rounded-[3px] border border-aegis-line bg-aegis-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-aegis-paper">
              @auto-nomos/crypto
            </code>
            , a thin wrapper around audited libraries from the{' '}
            <code className="rounded-[3px] border border-aegis-line bg-aegis-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-aegis-paper">
              @noble
            </code>{' '}
            family. We never invent crypto.
          </p>
        </div>
        <div className="overflow-hidden rounded-sm border border-aegis-line">
          <div className="grid grid-cols-12 border-b border-aegis-line bg-aegis-ink/60 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
            <div className="col-span-3">surface</div>
            <div className="col-span-6">primitive</div>
            <div className="col-span-3">implementation</div>
          </div>
          <ul className="divide-y divide-aegis-line">
            {rows.map(([surface, prim, impl]) => (
              <li
                key={surface}
                className="grid grid-cols-12 gap-3 px-5 py-4 text-sm text-aegis-paper"
              >
                <div className="col-span-3 font-display text-[16px]">{surface}</div>
                <div className="col-span-6 font-mono text-[12px] text-aegis-mute">{prim}</div>
                <div className="col-span-3 font-mono text-[11px] text-aegis-faint">{impl}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Threat() {
  return (
    <section className="mx-auto max-w-[1280px] px-6 py-24 md:px-10 md:py-32">
      <div className="grid grid-cols-12 gap-10">
        <div className="col-span-12 lg:col-span-4">
          <div className="eyebrow">threat model</div>
          <h2 className="display mt-4 text-[40px] text-aegis-paper">What we defend against.</h2>
        </div>
        <div className="col-span-12 lg:col-span-8 space-y-7">
          <Threats
            title="Compromised agent / prompt injection."
            body="A poisoned prompt convinces the agent to do something risky. Nomos denies the call at the policy gate; the agent never had a usable token in the first place. Step-up forces a human-in-the-loop on high-stakes actions even if the agent insists."
          />
          <Threats
            title="Credential exfiltration via responses."
            body="Some upstream APIs leak tokens or secrets in responses (think GitHub PATs in webhook payloads). The PDP runs a response sanitizer that redacts known secret formats and zero-width Unicode before the agent sees the body."
          />
          <Threats
            title="Tampered audit log."
            body="An attacker with DB access tries to redact a row. Hash chain breaks, daily signed root won't validate, the verifier CLI raises. All audit rows additionally archived to R2 with a 7-year lifecycle out of band."
          />
          <Threats
            title="Cross-tenant leakage."
            body="A bug in a query forgets to filter on customer_id. The cross-tenant integration test on every CI fakes a tenant-B context and asserts no row from tenant-A is reachable. Failures block release."
          />
          <Threats
            title="Stolen API key."
            value="An API key replaces a session for an agent. We rotate keys per environment, scope keys to one App, and revoke instantly via the dashboard. The audit chain shows the offending key's last call before revocation."
          />
        </div>
      </div>
    </section>
  );
}

function Threats({ title, body, value }: { title: string; body?: string; value?: string }) {
  return (
    <article className="border-l border-aegis-line pl-6">
      <h3 className="display text-[24px] leading-tight text-aegis-paper">{title}</h3>
      <p className="mt-2.5 text-sm leading-relaxed text-aegis-mute">{body ?? value}</p>
    </article>
  );
}

function Compliance() {
  return (
    <section className="border-y border-aegis-line bg-aegis-surface/30">
      <div className="mx-auto grid max-w-[1280px] grid-cols-12 gap-10 px-6 py-24 md:px-10">
        <div className="col-span-12 lg:col-span-5">
          <div className="eyebrow">compliance posture</div>
          <h2 className="display mt-4 text-[40px] text-aegis-paper">Where we stand.</h2>
          <p className="mt-5 text-sm leading-relaxed text-aegis-mute">
            Open beta. We&rsquo;re building toward SOC 2 Type II in the v1.0 window. Until
            certified, the runtime is shippable for pre-prod and non-regulated workloads.
            Customer-edge PDP is available on day one for teams that need data-locality.
          </p>
        </div>
        <div className="col-span-12 lg:col-span-7">
          <ul className="grid grid-cols-1 gap-px bg-aegis-line sm:grid-cols-2">
            {[
              { label: 'SOC 2 Type II', state: 'targeted v1.0' },
              { label: 'GDPR data export', state: 'on roadmap' },
              { label: 'Customer-edge PDP', state: 'available' },
              { label: 'Audit retention', state: '7 years (R2)' },
              { label: 'Encryption at rest', state: 'XChaCha20' },
              { label: 'TLS in transit', state: 'TLS 1.3 only' },
            ].map((c) => (
              <li
                key={c.label}
                className="flex items-center justify-between gap-4 bg-aegis-ink px-5 py-5"
              >
                <span className="text-sm text-aegis-paper">{c.label}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-aegis-mute">
                  {c.state}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Reporting() {
  return (
    <section className="mx-auto max-w-[1280px] px-6 py-24 md:px-10 md:py-32">
      <div className="grid grid-cols-12 gap-10">
        <div className="col-span-12 lg:col-span-7">
          <div className="eyebrow">disclosure</div>
          <h2 className="display mt-4 text-[40px] text-aegis-paper">
            Found something?
            <br />
            Tell us — <em>we&rsquo;ll listen</em>.
          </h2>
          <p className="mt-5 max-w-[560px] text-sm leading-relaxed text-aegis-mute">
            We run coordinated disclosure. Email{' '}
            <a href="mailto:security@aegis.dev" className="text-aegis-signal hover:underline">
              security@aegis.dev
            </a>{' '}
            with reproduction steps. We acknowledge in 24 hours, fix critical issues within 7 days,
            publish a CVE if appropriate, and credit you (or keep you anonymous — your call).
          </p>
        </div>
        <div className="col-span-12 lg:col-span-5">
          <div className="corners relative rounded-sm border border-aegis-line bg-aegis-surface/40 p-8">
            <Lock className="h-6 w-6 text-aegis-signal" />
            <div className="eyebrow mt-5">PGP</div>
            <p className="mt-2 text-sm text-aegis-mute">Public key fingerprint:</p>
            <p className="mt-2 break-all font-mono text-[11px] text-aegis-paper">
              4F5C 8A91 AE3D 02E1 B73F · 2C70 19DA 884E 6C92 1FAE
            </p>
            <Link
              href="/docs#audit"
              className="mt-7 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-paper hover:text-aegis-signal"
            >
              read about the audit chain →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
