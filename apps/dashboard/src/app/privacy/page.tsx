import Link from 'next/link';
import { PublicShell } from '../../components/nomos/public-shell';

export const metadata = {
  title: 'Privacy Policy · Nomos',
  description:
    'How Nomos collects, uses, stores, and shares personal data — including Google user data accessed through OAuth connectors.',
};

const EFFECTIVE_DATE = '2026-05-24';
const CONTACT_EMAIL = 'varendra@auto-nomos.com';

export default function PrivacyPage() {
  return (
    <PublicShell>
      <article className="mx-auto max-w-[820px] px-6 py-20 md:px-10 md:py-28">
        <header className="border-b border-aegis-line pb-10">
          <div className="eyebrow">legal · privacy</div>
          <h1 className="display mt-5 text-[44px] leading-[1.05] text-aegis-paper md:text-[56px]">
            Privacy Policy
          </h1>
          <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-faint">
            Effective {EFFECTIVE_DATE}
          </p>
          <p className="mt-6 text-base leading-relaxed text-aegis-mute">
            Nomos is a community-maintained open-source project. This policy explains what data the
            hosted Nomos service at auto-nomos.com (&ldquo;Nomos&rdquo;, &ldquo;we&rdquo;,
            &ldquo;us&rdquo;) collects when you use the dashboard, the Policy Decision Point (PDP),
            the Model Context Protocol (MCP) connectors, and related command-line tools. There is no
            incorporated legal entity behind Nomos; the service is operated by the project
            maintainers. If anything here is unclear, email{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-aegis-signal hover:underline">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </header>

        <Section title="1. Who we are">
          <p>
            Nomos is a community-maintained open-source authorization broker for AI agents. There is
            no incorporated legal entity. The hosted service is operated by the project maintainers
            and is reachable at{' '}
            <a href="https://auto-nomos.com" className="text-aegis-signal hover:underline">
              auto-nomos.com
            </a>
            . Source code is on GitHub. For privacy questions, data-subject requests, or security
            reports, contact{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-aegis-signal hover:underline">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </Section>

        <Section title="2. Data we collect">
          <p>We collect only what we need to operate the service:</p>
          <Bullets
            items={[
              <>
                <strong>Account data.</strong> Email address, name, hashed password (or OAuth
                identifier), organization membership, role, and authentication factors (passkey
                credential IDs).
              </>,
              <>
                <strong>OAuth tokens for third-party connectors.</strong> When you connect a SaaS
                provider (GitHub, Google, Slack, Notion, Linear, Stripe, Discord, Dropbox, Telegram,
                Twilio, Salesforce, Jira, Perplexity, Granola, Postgres, filesystem, SSH), we store
                the access token and (where available) refresh token issued by that provider,
                encrypted at rest with XChaCha20-Poly1305.
              </>,
              <>
                <strong>Policy + audit data.</strong> The Cedar policies you author, the
                authorization requests your agents make, the PDP decisions, and a hash-chained audit
                trail of every minted UCAN and every upstream proxied call.
              </>,
              <>
                <strong>Operational telemetry.</strong> Request logs, latency, error traces (via
                Sentry), and aggregated metrics (via OpenTelemetry). IP addresses are recorded for
                abuse prevention and rate limiting.
              </>,
              <>
                <strong>Billing data.</strong> If you are on a paid plan, we store invoice metadata.
                Payment instruments are handled by our payment processor; we never see full card
                numbers.
              </>,
            ]}
          />
        </Section>

        <Section title="3. Google user data">
          <p>
            When you connect a Google account (Drive, Gmail, Calendar, Sheets, Docs, Slides, Forms,
            or any sub-service exposed by Nomos), we receive an OAuth access token and refresh token
            from Google scoped to the OAuth scopes you explicitly granted in the Google consent
            screen.
          </p>
          <p className="mt-4">
            <strong>How we use Google user data.</strong> Solely to execute the specific authorized
            action your agent is requesting at runtime — for example, listing files, reading a
            specific document, or posting a Calendar event — and only when an unexpired UCAN issued
            by the PDP permits that action against that resource. We do not read Google user data
            for any other purpose.
          </p>
          <p className="mt-4">
            <strong>How we store Google user data.</strong> Refresh tokens are encrypted with
            XChaCha20-Poly1305 before being written to our database. Access tokens are held in
            memory or short-lived cache only. Response bodies fetched from Google are returned to
            your agent and are not retained on our servers after the request completes; only the
            audit record (timestamp, decision, hash of the request) is persisted.
          </p>
          <p className="mt-4">
            <strong>How we share Google user data.</strong> We do not sell, rent, or share Google
            user data with third parties. The data is transmitted only between Google, our PDP, and
            the authenticated agent or human acting on your behalf.
          </p>
          <p className="mt-4">
            <strong>AI/ML.</strong> We do not use Google user data to develop, improve, or train
            generalized AI/ML models.
          </p>
          <p className="mt-4">
            <strong>Limited Use compliance.</strong> Nomos&rsquo;s use and transfer of information
            received from Google APIs adheres to the{' '}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noreferrer"
              className="text-aegis-signal hover:underline"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
          <p className="mt-4">
            <strong>Revocation.</strong> You can disconnect a Google account at any time from the
            dashboard&rsquo;s Connections page, or revoke Nomos&rsquo;s access directly at{' '}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noreferrer"
              className="text-aegis-signal hover:underline"
            >
              myaccount.google.com/permissions
            </a>
            . On disconnect we delete the stored tokens within 7 days.
          </p>
        </Section>

        <Section title="4. How we use data">
          <Bullets
            items={[
              'Provide the authorization service: evaluate policies, mint UCANs, proxy upstream calls.',
              'Maintain the audit trail and let you (and auditors) verify it.',
              'Secure the service: detect abuse, rate limit, debug errors.',
              'Communicate with you about service changes, security advisories, and (if you opted in) product updates.',
              'Comply with legal obligations.',
            ]}
          />
          <p className="mt-4">
            We do not use your data to train AI models. We do not sell your data. We do not run ad
            networks.
          </p>
        </Section>

        <Section title="5. How we share data">
          <p>Limited and only with parties we need to operate the service:</p>
          <Bullets
            items={[
              <>
                <strong>Infrastructure providers.</strong> Cloud hosting (Microsoft Azure), managed
                Postgres, Cloudflare R2 (audit archive), Cloudflare (CDN/edge), Sentry (error
                tracking), Knock (transactional notifications).
              </>,
              <>
                <strong>Third-party APIs you authorize.</strong> When your agent calls GitHub,
                Google, Slack, etc. through Nomos, we transmit data to that provider on your behalf
                using the OAuth token you issued.
              </>,
              <>
                <strong>Legal.</strong> We disclose data when required by valid legal process or to
                protect rights, property, or safety.
              </>,
            ]}
          />
        </Section>

        <Section title="6. Data retention">
          <Bullets
            items={[
              'Account data — retained for the life of your account, deleted within 30 days of account closure.',
              'OAuth tokens — deleted within 7 days of disconnect or account closure.',
              'Audit events — retained 7 years in Cloudflare R2 (industry default for audit logs); you can request earlier deletion subject to legal-hold exceptions.',
              'Operational logs — 30 days rolling.',
              'Billing records — retained as required by tax law (typically 7 years).',
            ]}
          />
        </Section>

        <Section title="7. Security">
          <p>
            See our{' '}
            <Link href="/security" className="text-aegis-signal hover:underline">
              Security page
            </Link>{' '}
            for the full posture. Highlights: UCAN delegation (no shared secrets), Cedar policy
            enforcement, hash-chained audit log with Ed25519-signed daily roots, XChaCha20
            encryption for stored OAuth tokens, multi-tenant isolation tested on every CI, TLS 1.3
            in transit.
          </p>
        </Section>

        <Section title="8. Your rights">
          <p>
            Depending on jurisdiction (GDPR, CCPA, India DPDP Act, etc.) you may have rights to
            access, correct, export, or delete your personal data. Email{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-aegis-signal hover:underline">
              {CONTACT_EMAIL}
            </a>{' '}
            and we will respond within 30 days.
          </p>
        </Section>

        <Section title="9. International transfers">
          <p>
            Our primary deployment region is Central India (Microsoft Azure). Some sub-processors
            (Sentry, Cloudflare) may process data in other regions. We rely on Standard Contractual
            Clauses where required.
          </p>
        </Section>

        <Section title="10. Children">
          <p>
            Nomos is not directed at children under 16 and we do not knowingly collect their data.
          </p>
        </Section>

        <Section title="11. Changes to this policy">
          <p>
            We will post any material change here and update the effective date. For significant
            changes we will also email account owners at least 14 days before the change takes
            effect.
          </p>
        </Section>

        <Section title="12. Contact">
          <p>
            Privacy questions, data-subject requests, security disclosures:{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-aegis-signal hover:underline">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </Section>
      </article>
    </PublicShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-aegis-line py-10">
      <h2 className="display text-[24px] leading-tight text-aegis-paper md:text-[28px]">{title}</h2>
      <div className="mt-5 space-y-2 text-[15px] leading-relaxed text-aegis-mute">{children}</div>
    </section>
  );
}

function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="mt-2 space-y-2.5 pl-5">
      {items.map((item, i) => (
        <li
          key={i}
          className="list-disc text-[15px] leading-relaxed text-aegis-mute marker:text-aegis-faint"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}
