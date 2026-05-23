import type { Metadata, Viewport } from 'next';
import { Fraunces, Hanken_Grotesk, JetBrains_Mono } from 'next/font/google';
import Script from 'next/script';
import { Providers } from '../components/providers';
import './globals.css';

const display = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  axes: ['SOFT', 'WONK', 'opsz'],
});

const sans = Hanken_Grotesk({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://auto-nomos.com';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Nomos — open source authorization for AI agents',
    template: '%s · Nomos',
  },
  description:
    'Open source authorization layer for AI agents. Capability tokens instead of API keys. Cedar policy on every tool call. Hash-chained, Ed25519-signed audit you can replay. MCP-native — works in Claude Desktop, Cursor, and Claude Code today. 24 integrations, 283 brokered actions, <50ms p99 decision.',
  applicationName: 'Nomos',
  generator: 'Next.js',
  referrer: 'origin-when-cross-origin',
  keywords: [
    'Nomos',
    'AI agent authorization',
    'agent identity',
    'open source agent gateway',
    'self-hosted UCAN',
    'MCP credentials',
    'MCP authorization',
    'agent capability tokens',
    'Cedar policy engine for AI agents',
    'UCAN delegation',
    'Cedar policy',
    'federated OIDC',
    'workload identity federation',
    'AWS STS',
    'Azure workload identity',
    'GCP workload identity pools',
    'multi-agent swarms',
    'LangGraph security',
    'CrewAI security',
    'AutoGen security',
    'Claude sub-agents',
    'MCP server',
    'agent observability',
    'audit chain',
    'hash-chained audit',
    'step-up authentication',
    'passkey cosigner',
    'agent monitoring',
    'AI control plane',
    'AI security',
    'agent governance',
    'least privilege agents',
    'Nomos vs Auth0',
    'Nomos vs Vault',
    'Nomos vs Permit.io',
  ],
  authors: [{ name: 'Nomos', url: SITE_URL }],
  creator: 'Nomos',
  publisher: 'Nomos',
  category: 'security',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'Nomos',
    title: 'Nomos — open source authorization for AI agents',
    description:
      'Your agent should never hold a key it could leak. Capability tokens, Cedar policy, cryptographic audit — open source, MCP-native.',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Nomos — open source authorization for AI agents',
    description:
      'Your agent should never hold a key it could leak. UCAN capability tokens · Cedar policy · cryptographic audit · MCP-native.',
    creator: '@autonomos',
    site: '@autonomos',
  },
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/apple-icon', sizes: '180x180', type: 'image/png' }],
    shortcut: '/icon.svg',
  },
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#0f1419',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}#org`,
      name: 'Nomos',
      url: SITE_URL,
      logo: `${SITE_URL}/icon.svg`,
      sameAs: [
        'https://github.com/varendra007/nomos',
        'https://www.npmjs.com/org/auto-nomos',
        'https://twitter.com/autonomos',
      ],
      description:
        'Open source authorization layer for AI agents. Capability tokens, Cedar policy, cryptographic audit, MCP-native.',
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}#app`,
      name: 'Nomos',
      applicationCategory: 'SecurityApplication',
      operatingSystem: 'Cross-platform',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      description:
        'Open source authorization layer for AI agents. Capability tokens instead of API keys, Cedar policy on every call, hash-chained audit, MCP-native.',
      url: SITE_URL,
      publisher: { '@id': `${SITE_URL}#org` },
    },
    {
      '@type': 'SoftwareSourceCode',
      '@id': `${SITE_URL}#source`,
      name: 'Nomos',
      codeRepository: 'https://github.com/varendra007/nomos',
      programmingLanguage: ['TypeScript', 'Python'],
      runtimePlatform: 'Node.js',
      license: 'https://opensource.org/licenses/Apache-2.0',
      author: { '@id': `${SITE_URL}#org` },
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}#site`,
      url: SITE_URL,
      name: 'Nomos',
      publisher: { '@id': `${SITE_URL}#org` },
      inLanguage: 'en-US',
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="aegis"
      className={`${display.variable} ${sans.variable} ${mono.variable} dark`}
      suppressHydrationWarning
    >
      <body className="relative bg-aegis-ink font-sans text-aegis-paper antialiased">
        <Script
          id="ld-json-org"
          type="application/ld+json"
          strategy="beforeInteractive"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: canonical JSON-LD injection; payload is a static object serialized via JSON.stringify
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
