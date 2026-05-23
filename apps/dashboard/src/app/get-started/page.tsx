import type { Metadata } from 'next';
import Script from 'next/script';
import { Bottom } from '../../components/marketing/get-started/bottom';
import { Hero } from '../../components/marketing/get-started/hero';
import { StepApp } from '../../components/marketing/get-started/step-app';
import { StepCall } from '../../components/marketing/get-started/step-call';
import { StepConnect } from '../../components/marketing/get-started/step-connect';
import { StepPolicy } from '../../components/marketing/get-started/step-policy';
import { PublicShell } from '../../components/nomos/public-shell';

export const metadata: Metadata = {
  title: 'Get started — Nomos',
  description:
    'Your first authorized agent call in 10 minutes. Connect an agent, create an app, attach a policy, trigger a call — side-by-side CLI, MCP, and SDK paths.',
  alternates: { canonical: '/get-started' },
  openGraph: {
    title: 'Get started — Nomos',
    description:
      'Your first authorized agent call in 10 minutes. CLI, MCP, or SDK — pick the path that fits your stack.',
  },
};

const HOW_TO_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'HowTo',
  name: 'Get started with Nomos',
  description:
    'Make your first authorized AI agent call: connect an agent, create an App, attach a policy, and trigger the call via CLI, MCP, or SDK.',
  totalTime: 'PT10M',
  step: [
    {
      '@type': 'HowToStep',
      position: 1,
      name: 'Connect an agent',
      url: 'https://auto-nomos.com/get-started#step-1',
      text: 'Install the CLI, configure the MCP server, or initialize the SDK with your Nomos API key.',
    },
    {
      '@type': 'HowToStep',
      position: 2,
      name: 'Create an App',
      url: 'https://auto-nomos.com/get-started#step-2',
      text: "Issue a Nomos App and an API key. The App is your agent's identity inside the organization.",
    },
    {
      '@type': 'HowToStep',
      position: 3,
      name: 'Attach a policy',
      url: 'https://auto-nomos.com/get-started#step-3',
      text: 'Instantiate the github:read-only starter template (or build your own in the visual policy builder) and attach it to your App.',
    },
    {
      '@type': 'HowToStep',
      position: 4,
      name: 'Trigger your first call',
      url: 'https://auto-nomos.com/get-started#step-4',
      text: 'Authorize the call to get a UCAN, then proxy through the PDP. Both events land in the hash-chained audit log.',
    },
  ],
};

export default function GetStartedPage() {
  return (
    <PublicShell>
      <Script
        id="ld-json-howto-get-started"
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: server-rendered JSON-LD
        dangerouslySetInnerHTML={{ __html: JSON.stringify(HOW_TO_JSON_LD) }}
      />
      <Hero />
      <StepConnect />
      <StepApp />
      <StepPolicy />
      <StepCall />
      <Bottom />
    </PublicShell>
  );
}
