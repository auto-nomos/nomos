'use client';

/* ======================================================================
   Nomos — public shell
   ----------------------------------------------------------------------
   Marketing wrapper. Sticky chartreuse-edged topbar with a primary nav
   trimmed to five high-intent pages; secondary chrome (Security,
   Changelog) lives only in the footer to keep the bar uncrowded.
   Footer is a three-band composition: brand + columns, social bar with
   live signal chips, then the legal line. Reuses the global pulse class
   so even on marketing pages the user feels live infrastructure under
   the brand.
   ====================================================================== */

import { ArrowUpRight, Github, MessageCircle, Package } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  DISCORD_INVITE_URL,
  GITHUB_DISCUSSIONS_URL,
  GITHUB_REPO_URL,
  GITHUB_STAR_URL,
  NPM_ORG_URL,
  TWITTER_URL,
} from '../../lib/community-links';
import { cn } from '../../lib/utils';
import { NomosLogo } from './logo';

interface NavLink {
  href: string;
  label: string;
}

const PRIMARY_NAV: NavLink[] = [
  { href: '/docs', label: 'Docs' },
  { href: '/integrations', label: 'Integrations' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/open-source', label: 'Open source' },
  { href: '/community', label: 'Community' },
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
    <header className="sticky top-0 z-30 border-b border-aegis-line bg-aegis-ink/80 backdrop-blur-md">
      {/* Hairline chartreuse top edge — subtle brand signal across every page. */}
      <div className="h-px bg-gradient-to-r from-transparent via-aegis-signal/40 to-transparent" />
      <div className="mx-auto flex h-[68px] max-w-[1280px] items-center justify-between gap-6 px-6 md:px-10">
        <Link href="/" className="group flex items-center gap-3" aria-label="Nomos home">
          <NomosLogo size={26} />
          <span className="hidden items-center gap-1.5 rounded-full border border-aegis-signal/30 bg-aegis-signal/5 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.22em] text-aegis-signal lg:inline-flex">
            <span className="h-1 w-1 rounded-full bg-aegis-signal" />
            beta
          </span>
        </Link>
        <nav className="hidden items-center gap-0.5 md:flex" aria-label="Primary">
          {PRIMARY_NAV.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors',
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
            className="hidden items-center gap-2 rounded-sm border border-aegis-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-mute transition-colors hover:border-aegis-line-strong hover:text-aegis-paper md:inline-flex"
          >
            <Github className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Star</span>
          </a>
          <a
            href={DISCORD_INVITE_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Join Nomos Discord"
            className="hidden items-center justify-center rounded-sm border border-aegis-line px-2.5 py-1.5 text-aegis-mute transition-colors hover:border-aegis-line-strong hover:text-aegis-paper md:inline-flex"
          >
            <MessageCircle className="h-3.5 w-3.5" />
          </a>
          <span className="hidden h-5 w-px bg-aegis-line md:inline-block" />
          <Link
            href="/privacy"
            className="hidden px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint transition-colors hover:text-aegis-paper lg:inline-flex"
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            className="hidden px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint transition-colors hover:text-aegis-paper lg:inline-flex"
          >
            Terms
          </Link>
          <Link
            href="/sign-in"
            className="hidden px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-mute transition-colors hover:text-aegis-paper md:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="group inline-flex items-center gap-2 rounded-sm border border-aegis-signal/40 bg-aegis-signal/10 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-signal transition-colors hover:border-aegis-signal hover:bg-aegis-signal/20"
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
    <footer className="relative border-t border-aegis-line bg-aegis-ink/60 backdrop-blur">
      {/* Hairline chartreuse top edge mirrors the topbar — bookends the page. */}
      <div className="h-px bg-gradient-to-r from-transparent via-aegis-signal/30 to-transparent" />

      {/* Band 1 — brand + columns. */}
      <div className="mx-auto grid max-w-[1280px] grid-cols-2 gap-10 px-6 pt-16 pb-12 md:grid-cols-12 md:px-10">
        <div className="col-span-2 md:col-span-4">
          <NomosLogo size={26} />
          <p className="mt-6 max-w-[340px] text-sm leading-relaxed text-aegis-mute">
            The authorization layer for AI agents. Cryptographic delegation, policy gates, audit
            chain — built so your agents can act without ever holding a raw credential.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-sm border border-aegis-line bg-aegis-surface/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-mute">
              <span className="pulse" />
              Operational · v0.1.x
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-sm border border-aegis-signal/30 bg-aegis-signal/5 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-signal">
              Free during open beta
            </span>
          </div>
          <div className="mt-5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
            <span>chain head</span>
            <span aria-hidden>·</span>
            <span className="text-aegis-paper">09f4 · 1c7b · ae71</span>
          </div>
        </div>

        <FooterColumn label="Product">
          <FooterLink href="/docs#cloud-iam">Cloud IAM</FooterLink>
          <FooterLink href="/docs#swarms">Multi-agent swarms</FooterLink>
          <FooterLink href="/docs#monitoring">Live monitoring</FooterLink>
          <FooterLink href="/integrations">Integrations</FooterLink>
          <FooterLink href="/pricing">Pricing</FooterLink>
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

        <FooterColumn label="Company">
          <FooterLink href="/security">Security</FooterLink>
          <FooterLink href="/changelog">Changelog</FooterLink>
          <FooterLink href="/sign-up">Create account</FooterLink>
          <FooterLink href="/sign-in">Sign in</FooterLink>
          <FooterLink href="/docs#faq">FAQ</FooterLink>
        </FooterColumn>
      </div>

      {/* Band 2 — social pills + npm chip. */}
      <div className="border-t border-aegis-line">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4 px-6 py-5 md:px-10">
          <div className="flex flex-wrap items-center gap-2">
            <SocialPill href={GITHUB_REPO_URL} icon={Github} label="GitHub" />
            <SocialPill href={DISCORD_INVITE_URL} icon={MessageCircle} label="Discord" />
            <SocialPill href={NPM_ORG_URL} icon={Package} label="@auto-nomos" />
            <SocialPill href={TWITTER_URL} icon={TwitterMark} label="Twitter" />
          </div>
          <a
            href={GITHUB_STAR_URL}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-mute transition-colors hover:text-aegis-signal"
          >
            <span>Star to be #1 on day one</span>
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-px group-hover:translate-x-px" />
          </a>
        </div>
      </div>

      {/* Band 3 — legal. */}
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

function SocialPill({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      className="group inline-flex items-center gap-2 rounded-sm border border-aegis-line bg-aegis-surface/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-mute transition-colors hover:border-aegis-signal/40 hover:bg-aegis-signal/5 hover:text-aegis-paper"
    >
      <Icon className="h-3.5 w-3.5 transition-colors group-hover:text-aegis-signal" />
      <span>{label}</span>
    </a>
  );
}

function TwitterMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <title>Twitter</title>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
