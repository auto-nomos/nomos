'use client';

/* ======================================================================
   Nomos — public shell
   ----------------------------------------------------------------------
   Wrapper for marketing / docs / changelog / security / integrations
   pages. Dark canvas inherits from the root layout. Top nav is sticky;
   active route is signaled by a chartreuse underline. Footer carries
   the build hash + status pulse so even on the marketing site the user
   feels the live infrastructure under the brand.
   ====================================================================== */

import { ArrowUpRight, Github } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  DISCORD_INVITE_URL,
  GITHUB_DISCUSSIONS_URL,
  GITHUB_REPO_URL,
  GITHUB_STAR_URL,
} from '../../lib/community-links';
import { cn } from '../../lib/utils';
import { NomosLogo } from './logo';

interface NavLink {
  href: string;
  label: string;
  external?: boolean;
}

const NAV: NavLink[] = [
  { href: '/docs', label: 'Docs' },
  { href: '/integrations', label: 'Integrations' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/open-source', label: 'Open source' },
  { href: '/community', label: 'Community' },
  { href: '/security', label: 'Security' },
  { href: '/changelog', label: 'Changelog' },
];

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <PublicTopbar />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}

function PublicTopbar() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-aegis-line bg-aegis-ink/70 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-6 md:px-10">
        <Link href="/" className="flex items-center" aria-label="Nomos home">
          <NomosLogo size={24} />
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors',
                  active ? 'text-aegis-paper' : 'text-aegis-mute hover:text-aegis-paper',
                )}
              >
                {item.label}
                {active ? (
                  <span className="absolute inset-x-3 -bottom-px h-px bg-aegis-signal" />
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <a
            href={GITHUB_STAR_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Star Nomos on GitHub"
            className="hidden items-center gap-1.5 px-2 py-1.5 text-aegis-mute transition-colors hover:text-aegis-paper md:inline-flex"
          >
            <Github className="h-4 w-4" />
          </a>
          <Link
            href="/sign-in"
            className="hidden items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-mute transition-colors hover:text-aegis-paper md:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="group inline-flex items-center gap-2 rounded-sm border border-aegis-signal/40 bg-aegis-signal/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-signal transition-colors hover:border-aegis-signal hover:bg-aegis-signal/20"
          >
            Get started
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-px group-hover:translate-x-px" />
          </Link>
        </div>
      </div>
    </header>
  );
}

function PublicFooter() {
  return (
    <footer className="border-t border-aegis-line bg-aegis-ink/50 backdrop-blur">
      <div className="mx-auto grid max-w-[1280px] grid-cols-2 gap-10 px-6 py-14 md:grid-cols-12 md:px-10">
        <div className="col-span-2 md:col-span-3">
          <NomosLogo size={22} />
          <p className="mt-5 max-w-[320px] text-sm leading-relaxed text-aegis-mute">
            The authorization layer for AI agents. Cryptographic delegation, policy gates, audit
            chain — built so your agents can act without ever holding a raw credential.
          </p>
          <p className="mt-3 max-w-[320px] text-sm leading-relaxed text-aegis-mute">
            Open source coming soon —{' '}
            <code className="font-mono text-[12px] text-aegis-paper">@auto-nomos/*</code> on npm
            today.
          </p>
          <div className="mt-6 flex items-center gap-2">
            <span className="pulse" />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-mute">
              Operational · v0.1.x
            </span>
          </div>
        </div>

        <FooterColumn label="Product">
          <FooterLink href="/docs#cloud-iam">Cloud IAM</FooterLink>
          <FooterLink href="/docs#swarms">Multi-agent swarms</FooterLink>
          <FooterLink href="/docs#monitoring">Live monitoring</FooterLink>
          <FooterLink href="/integrations">Integrations</FooterLink>
          <FooterLink href="/pricing">Pricing</FooterLink>
          <FooterLink href="/security">Security</FooterLink>
          <FooterLink href="/changelog">Changelog</FooterLink>
        </FooterColumn>

        <FooterColumn label="Build">
          <FooterLink href="/docs#quickstart">Quickstart</FooterLink>
          <FooterLink href="/docs#sdk">SDK reference</FooterLink>
          <FooterLink href="/docs#cloud-setup">Cloud federation setup</FooterLink>
          <FooterLink href="/docs#policies">Policy authoring</FooterLink>
          <FooterLink href="/docs#audit">Audit chain</FooterLink>
          <FooterLink href="/open-source">Open source</FooterLink>
        </FooterColumn>

        <FooterColumn label="Community">
          <FooterLink href={GITHUB_REPO_URL} external>
            GitHub
          </FooterLink>
          <FooterLink href={DISCORD_INVITE_URL} external>
            Discord
          </FooterLink>
          <FooterLink href={GITHUB_DISCUSSIONS_URL} external>
            Discussions
          </FooterLink>
          <FooterLink href="/community">Contributors</FooterLink>
          <FooterLink href="/vs/auth0">Nomos vs Auth0</FooterLink>
          <FooterLink href="/vs/vault">Nomos vs Vault</FooterLink>
        </FooterColumn>

        <FooterColumn label="Account">
          <FooterLink href="/sign-up">Create account</FooterLink>
          <FooterLink href="/sign-in">Sign in</FooterLink>
          <FooterLink href="/docs#faq">FAQ</FooterLink>
        </FooterColumn>
      </div>

      <div className="border-t border-aegis-line">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4 px-6 py-5 md:px-10">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
            © {new Date().getFullYear()} Nomos · An authorization layer for agents.
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
            Made for the era of autonomous tools.
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="col-span-1 md:col-span-2">
      <div className="eyebrow">{label}</div>
      <ul className="mt-4 space-y-2.5">{children}</ul>
    </div>
  );
}

function FooterLink({
  href,
  children,
  external,
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
}) {
  if (external) {
    return (
      <li>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-aegis-mute transition-colors hover:text-aegis-paper"
        >
          {children}
        </a>
      </li>
    );
  }
  return (
    <li>
      <Link
        href={href}
        className="text-sm text-aegis-mute transition-colors hover:text-aegis-paper"
      >
        {children}
      </Link>
    </li>
  );
}
