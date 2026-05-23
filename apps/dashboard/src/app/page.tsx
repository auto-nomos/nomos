import Script from 'next/script';
import { Answer } from '../components/marketing/answer';
import { Audit } from '../components/marketing/audit';
import { BottomCta } from '../components/marketing/bottom-cta';
import { Community } from '../components/marketing/community';
import { Comparison } from '../components/marketing/comparison';
import { Decision } from '../components/marketing/decision';
import { Hero } from '../components/marketing/hero';
import { Marquee } from '../components/marketing/marquee';
import { Mcp } from '../components/marketing/mcp';
import { Mistake } from '../components/marketing/mistake';
import { OpenSource } from '../components/marketing/open-source';
import { Stepup } from '../components/marketing/stepup';
import { PublicShell } from '../components/nomos/public-shell';

/**
 * Nomos homepage — twelve bands, one idea per band.
 *
 *   1. Hero            your agent should never hold a key it could leak
 *   2. Marquee         24 integrations, 283 actions, one policy engine
 *   3. Mistake         a token in a prompt is a token in a screenshot
 *   4. Answer          three primitives, one page of code
 *   5. Decision        one guard(), every tool call
 *   6. Audit           every decision signed and chained
 *   7. Stepup          for the calls that matter
 *   8. Mcp             one npx, in your editor
 *   9. OpenSource      coming very soon, star to be there day one
 *  10. Community       build with us
 *  11. Comparison      why not just X?
 *  12. BottomCta       two paths — hosted or self-host
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://auto-nomos.com';

const FAQ_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  '@id': `${SITE_URL}#faq`,
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is Nomos?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Nomos is the authorization layer for AI agents. It mints capability tokens (UCAN), evaluates Cedar policy on every tool call, proxies the call so credentials never reach the agent, and records every decision in a hash-chained, Ed25519-signed audit log.',
      },
    },
    {
      '@type': 'Question',
      name: 'How is Nomos different from Auth0?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Auth0 logs in human users. Nomos authorizes AI agents — every action gated, every credential short-lived, every call audited. They sit at different layers and compose without conflict.',
      },
    },
    {
      '@type': 'Question',
      name: 'How is Nomos different from HashiCorp Vault?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Vault stores secrets and hands them to clients. Nomos refuses to. The agent receives the result of a tool call, not the credential used to make it — there is nothing on the agent disk to leak.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is Nomos open source?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Thirteen packages are already published on npm under @auto-nomos/*. The full control-plane and dashboard source go public alongside our 1.0 release under Apache-2.0.',
      },
    },
    {
      '@type': 'Question',
      name: 'Does Nomos work with MCP?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes — Nomos ships as an MCP server. Run npx -y @auto-nomos/mcp-server in Claude Desktop, Cursor, Claude Code, or Windsurf, and every tool call across all 24 integrations is gated, proxied, and chained.',
      },
    },
    {
      '@type': 'Question',
      name: 'Which agent frameworks does Nomos support?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'LangGraph, CrewAI, AutoGen, Claude sub-agents, and any framework that can call our TypeScript or Python SDK. Multi-agent swarms inherit UCAN delegation chains automatically.',
      },
    },
  ],
};

export default function HomePage() {
  return (
    <PublicShell>
      <Script
        id="ld-json-faq"
        type="application/ld+json"
        strategy="afterInteractive"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: canonical JSON-LD injection; payload is a static object serialized via JSON.stringify
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }}
      />
      <Hero />
      <Marquee />
      <Mistake />
      <Answer />
      <Decision />
      <Audit />
      <Stepup />
      <Mcp />
      <OpenSource />
      <Community />
      <Comparison />
      <BottomCta />
    </PublicShell>
  );
}
