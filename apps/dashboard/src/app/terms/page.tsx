import Link from 'next/link';
import { PublicShell } from '../../components/nomos/public-shell';

export const metadata = {
  title: 'Terms of Service · Nomos',
  description: 'The terms that govern your use of Nomos — the authorization broker for AI agents.',
};

const EFFECTIVE_DATE = '2026-05-24';
const CONTACT_EMAIL = 'communications@auto-nomos.com';

export default function TermsPage() {
  return (
    <PublicShell>
      <article className="mx-auto max-w-[820px] px-6 py-20 md:px-10 md:py-28">
        <header className="border-b border-aegis-line pb-10">
          <div className="eyebrow">legal · terms</div>
          <h1 className="display mt-5 text-[44px] leading-[1.05] text-aegis-paper md:text-[56px]">
            Terms of Service
          </h1>
          <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-faint">
            Effective {EFFECTIVE_DATE}
          </p>
          <p className="mt-6 text-base leading-relaxed text-aegis-mute">
            Nomos is a community-maintained open-source project. There is no incorporated legal
            entity behind the hosted service; it is operated by the project maintainers on a
            best-effort basis. These Terms govern your access to and use of the Nomos service
            (&ldquo;Service&rdquo;) at auto-nomos.com, the dashboard, the Policy Decision Point
            (PDP), the MCP connectors, the CLI, and the SDKs (collectively, &ldquo;Nomos&rdquo;). By
            using Nomos you agree to these Terms.
          </p>
        </header>

        <Section title="1. The service">
          <p>
            Nomos is a community-maintained authorization broker for AI agents. It holds OAuth
            credentials for third-party providers (GitHub, Google, Slack, Notion, Linear, Stripe,
            Discord, Dropbox, Telegram, Twilio, Salesforce, Jira, Perplexity, Granola, Postgres,
            filesystem, SSH, and others), evaluates Cedar policies on every agent request, and mints
            short-lived UCAN delegations scoped to one action, one resource, one minute. All source
            code is open source under the licenses published in the GitHub repository. The hosted
            service at auto-nomos.com is offered free of charge and provided as-is by the
            maintainers.
          </p>
        </Section>

        <Section title="2. Accounts">
          <Bullets
            items={[
              'You must provide accurate registration information and keep it current.',
              'You are responsible for safeguarding credentials, passkeys, and API keys associated with your account.',
              'You must notify us promptly at the contact email below if you suspect unauthorized access.',
              'One human per account. Service accounts are permitted for agents and CI.',
              'You must be at least 16 years old to use Nomos.',
            ]}
          />
        </Section>

        <Section title="3. Cost">
          <p>
            The hosted Nomos service is currently offered free of charge. There are no paid plans,
            no billing, and no payment instruments collected. If paid plans are introduced in the
            future, pricing will be published on the Pricing page and existing users will be
            notified at least 30 days before any charge applies.
          </p>
        </Section>

        <Section title="4. Acceptable use">
          <p>You agree not to:</p>
          <Bullets
            items={[
              'Use Nomos to access systems or data you are not authorized to access.',
              'Use Nomos to violate any law or any third-party provider’s terms of service (GitHub, Google, Slack, etc.).',
              'Reverse-engineer, decompile, or attempt to extract source code from the hosted service (open-source components are exempt under their respective licenses).',
              'Probe, scan, or test the vulnerability of the Service except under a coordinated disclosure agreement.',
              'Send spam, phish, distribute malware, or use Nomos as part of a command-and-control infrastructure for malicious agents.',
              'Resell, sublicense, or white-label the hosted Service without a written agreement.',
              'Use the Service to generate training data for AI models that compete with Nomos.',
              'Circumvent rate limits, quota, or usage controls.',
            ]}
          />
          <p className="mt-4">
            We may suspend or terminate accounts that violate these rules, with notice when
            practical and without notice when necessary to protect the Service or third parties.
          </p>
        </Section>

        <Section title="5. Your content and data">
          <p>
            You retain all rights to the Cedar policies you author, the connector credentials you
            provide, and the data your agents transmit through Nomos. You grant Nomos a limited,
            non-exclusive license to process this data solely to operate the Service on your behalf.
            We handle this data per our{' '}
            <Link href="/privacy" className="text-aegis-signal hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </Section>

        <Section title="6. Third-party services">
          <p>
            Nomos connects to third-party APIs. Your use of those services is governed by their own
            terms (GitHub Terms of Service, Google API Terms of Service, Slack API Terms, etc.).
            Nomos is not responsible for the availability, accuracy, or behavior of third-party
            services. You are responsible for granting and revoking OAuth scopes appropriate for
            your agent&rsquo;s tasks.
          </p>
        </Section>

        <Section title="7. Service availability">
          <p>
            We aim for high availability but do not guarantee uninterrupted service unless covered
            by a written SLA in your plan. We may perform maintenance, upgrades, and emergency
            repairs that temporarily impact availability. Status and incident history are published;
            subscribe for notifications from the dashboard.
          </p>
        </Section>

        <Section title="8. Intellectual property">
          <p>
            The Nomos brand, the hosted Service, and proprietary components are owned by us.
            Open-source components (the SDKs, CLIs, MCP server, schema packs, audit verifier, and
            similar) are licensed under their published open-source licenses (see the GitHub
            repository). Nothing in these Terms transfers ownership of our intellectual property to
            you.
          </p>
        </Section>

        <Section title="9. Beta features">
          <p>
            Nomos is in open beta. Features marked beta, preview, or experimental may change, break,
            or be removed without notice. Do not use beta features for regulated production
            workloads without an explicit agreement.
          </p>
        </Section>

        <Section title="10. Disclaimers">
          <p className="uppercase tracking-wide">
            The service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without
            warranties of any kind, express or implied, including merchantability, fitness for a
            particular purpose, and non-infringement. We do not warrant that the service will be
            error-free, secure, or uninterrupted.
          </p>
        </Section>

        <Section title="11. Limitation of liability">
          <p className="uppercase tracking-wide">
            To the maximum extent permitted by law, in no event will the Nomos project, its
            maintainers, or its contributors be liable for any indirect, incidental, special,
            consequential, or punitive damages, or any loss of profits, revenues, data, or goodwill,
            arising out of or related to your use of the service. Because Nomos is an unincorporated
            community project provided free of charge, the maintainers assume no aggregate monetary
            liability.
          </p>
        </Section>

        <Section title="12. Indemnification">
          <p>
            You agree to indemnify and hold harmless the Nomos project, its maintainers, and its
            contributors from any claim or demand arising out of your use of the Service in
            violation of these Terms, your violation of any law, or your infringement of any
            third-party right.
          </p>
        </Section>

        <Section title="13. Termination">
          <Bullets
            items={[
              'You may terminate at any time by closing your account from the dashboard.',
              'We may terminate or suspend for material breach, prolonged non-payment, or to comply with law.',
              'On termination we delete account data within 30 days and OAuth tokens within 7 days, subject to legal-hold exceptions.',
              'Sections that by their nature should survive termination (IP, disclaimers, limitation of liability, indemnification, governing law) survive.',
            ]}
          />
        </Section>

        <Section title="14. Changes to these terms">
          <p>
            We may update these Terms. For material changes we will email account owners at least 14
            days before the change takes effect. Continued use after the effective date constitutes
            acceptance.
          </p>
        </Section>

        <Section title="15. Dispute resolution">
          <p>
            Because Nomos is an unincorporated community project, disputes should first be raised
            informally by email to{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-aegis-signal hover:underline">
              {CONTACT_EMAIL}
            </a>
            . The maintainers will respond in good faith. If informal resolution fails, any
            remaining dispute will be governed by the laws applicable in your place of residence, to
            the extent permitted by mandatory consumer-protection law.
          </p>
        </Section>

        <Section title="16. Contact">
          <p>
            Questions about these Terms:{' '}
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
