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

import { ArrowUpRight, Github, Menu, MessageCircle, Package, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
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
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  return (
    <header className="sticky top-0 z-30 border-b border-aegis-line bg-aegis-ink/80 backdrop-blur-md">
      {/* Hairline chartreuse top edge — subtle brand signal across every page. */}
      <div className="h-px bg-gradient-to-r from-transparent via-aegis-signal/40 to-transparent" />
      <div className="mx-auto flex h-[68px] max-w-[1280px] items-center justify-between gap-3 px-4 sm:gap-6 sm:px-6 md:px-10">
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
            href="/sign-in"
            className="hidden px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-mute transition-colors hover:text-aegis-paper md:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="group inline-flex items-center gap-2 rounded-sm border border-aegis-signal/40 bg-aegis-signal/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-signal transition-colors hover:border-aegis-signal hover:bg-aegis-signal/20 sm:px-3.5"
          >
            Get started
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-px group-hover:translate-x-px" />
          </Link>
          <button
            type="button"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            aria-controls="nomos-mobile-nav"
            onClick={() => setMobileOpen((open) => !open)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-aegis-line text-aegis-paper transition-colors hover:border-aegis-signal/60 hover:text-aegis-signal md:hidden"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <MobileNav open={mobileOpen} onClose={() => setMobileOpen(false)} pathname={pathname} />
    </header>
  );
}

function MobileNav({
  open,
  onClose,
  pathname,
}: {
  open: boolean;
  onClose: () => void;
  pathname: string | null;
}) {
  return (
    <div
      id="nomos-mobile-nav"
      className={cn('md:hidden', open ? 'pointer-events-auto' : 'pointer-events-none')}
    >
      <button
        type="button"
        aria-label="Close menu"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className={cn(
          'fixed inset-x-0 top-[69px] bottom-0 z-20 bg-aegis-ink/70 backdrop-blur-sm transition-opacity duration-200',
          open ? 'opacity-100' : 'opacity-0',
        )}
      />
      <div
        className={cn(
          'absolute inset-x-0 top-full z-30 origin-top border-b border-aegis-line bg-aegis-ink/95 backdrop-blur-md transition-[opacity,transform] duration-200',
          open ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0',
        )}
      >
        <nav
          aria-label="Mobile primary"
          className="mx-auto flex max-w-[1280px] flex-col gap-1 px-4 pt-4 pb-3 sm:px-6"
        >
          {PRIMARY_NAV.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'rounded-sm px-3 py-3 font-mono text-[12px] uppercase tracking-[0.18em] transition-colors',
                  active
                    ? 'bg-aegis-signal/10 text-aegis-signal'
                    : 'text-aegis-paper hover:bg-aegis-surface/60',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mx-auto max-w-[1280px] border-t border-aegis-line px-4 py-3 sm:px-6">
          <Link
            href="/sign-in"
            onClick={onClose}
            className="block rounded-sm px-3 py-3 font-mono text-[12px] uppercase tracking-[0.18em] text-aegis-mute transition-colors hover:bg-aegis-surface/60 hover:text-aegis-paper"
          >
            Sign in
          </Link>
        </div>
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-2 border-t border-aegis-line px-4 py-4 sm:px-6">
          <a
            href={GITHUB_STAR_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-sm border border-aegis-line px-3 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-mute transition-colors hover:border-aegis-line-strong hover:text-aegis-paper"
          >
            <Github className="h-3.5 w-3.5" />
            Star
          </a>
          <a
            href={DISCORD_INVITE_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-sm border border-aegis-line px-3 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-mute transition-colors hover:border-aegis-line-strong hover:text-aegis-paper"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Discord
          </a>
        </div>
      </div>
    </div>
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
          <FooterLink href="/privacy">Privacy</FooterLink>
          <FooterLink href="/terms">Terms</FooterLink>
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
          <nav
            aria-label="Legal"
            className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint"
          >
            <Link href="/privacy" className="transition-colors hover:text-aegis-paper">
              Privacy Policy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-aegis-paper">
              Terms of Service
            </Link>
            <span>Made for the era of autonomous tools.</span>
          </nav>
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
