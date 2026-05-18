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
    default: 'Nomos — control plane for cloud keys, agent swarms, and live audit',
    template: '%s · Nomos',
  },
  description:
    'Nomos is the control plane for AI agents. Federated OIDC for AWS, Azure, and GCP mints short-lived cloud credentials per agent request. UCAN delegation attenuates scope across multi-agent swarms (LangGraph, CrewAI, AutoGen, Claude sub-agents). Every decision lands in a hash-chained audit you can replay — no long-lived secrets, no out-of-band logging.',
  applicationName: 'Nomos',
  generator: 'Next.js',
  referrer: 'origin-when-cross-origin',
  keywords: [
    'Nomos',
    'AI agent authorization',
    'agent identity',
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
    title: 'Nomos — control plane for cloud keys, agent swarms, and live audit',
    description:
      'Federated OIDC for AWS / Azure / GCP. UCAN delegation across multi-agent swarms. Hash-chained audit you can replay. The authorization layer for AI agents.',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Nomos — control plane for AI agents',
    description:
      'Federated OIDC for AWS / Azure / GCP. UCAN delegation across multi-agent swarms. Hash-chained audit you can replay.',
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
      sameAs: ['https://github.com/auto-nomos'],
      description:
        'The authorization layer for AI agents. Federated OIDC, UCAN delegation, hash-chained audit.',
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}#app`,
      name: 'Nomos',
      applicationCategory: 'SecurityApplication',
      operatingSystem: 'Cross-platform',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      description:
        'Control plane that mints short-lived cloud credentials, attenuates UCANs across multi-agent swarms, and streams every decision into a hash-chained audit.',
      url: SITE_URL,
      publisher: { '@id': `${SITE_URL}#org` },
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
