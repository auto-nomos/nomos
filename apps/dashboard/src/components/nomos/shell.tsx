'use client';

import {
  Activity,
  BellRing,
  BookOpen,
  Boxes,
  CircleDot,
  Cloud,
  Cog,
  FileLock2,
  Gauge,
  GitBranch,
  KeyRound,
  Layers,
  LayoutGrid,
  LogOut,
  Plug,
  Server,
  ShieldCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { authClient, useSession } from '../../lib/auth-client';
import { trpc } from '../../lib/trpc';
import { cn } from '../../lib/utils';
import { NomosLogo } from './logo';
import { OrgSwitcher } from './org-switcher';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
  badge?: string;
  external?: boolean;
}

const NAV_GROUPS: { id: string; label: string; items: NavItem[] }[] = [
  {
    id: 'monitor',
    label: 'Monitor',
    items: [
      { href: '/app', label: 'Overview', icon: CircleDot, hint: 'home' },
      { href: '/app/approvals', label: 'Approvals', icon: BellRing, hint: 'pending step-ups' },
      { href: '/app/audit', label: 'Audit chain', icon: Activity, hint: 'every decision' },
      { href: '/app/grants', label: 'Standing grants', icon: ShieldCheck, hint: 'durable' },
    ],
  },
  {
    id: 'build',
    label: 'Build',
    items: [
      { href: '/app/agents', label: 'Apps', icon: Boxes, hint: 'agents + keys' },
      {
        href: '/app/swarms',
        label: 'Swarms',
        icon: GitBranch,
        hint: 'delegation chains',
        badge: 'beta',
      },
      { href: '/app/policies', label: 'Policies', icon: FileLock2, hint: 'cedar + visual' },
      { href: '/app/connections', label: 'Connections', icon: Plug, hint: 'OAuth bridge' },
      { href: '/app/cloud', label: 'Cloud accounts', icon: Cloud, hint: 'AWS / Azure / GCP' },
      {
        href: '/integrations',
        label: 'Marketplace',
        icon: LayoutGrid,
        hint: 'connector catalog',
        external: true,
      },
    ],
  },
  {
    id: 'account',
    label: 'Account',
    items: [
      { href: '/app/billing', label: 'Billing', icon: Gauge, hint: 'usage + plan' },
      { href: '/app/settings/workspace', label: 'Workspace', icon: Boxes, hint: 'org IDs + TF' },
      { href: '/app/settings/members', label: 'Members', icon: Users, hint: 'team + roles' },
      { href: '/app/settings/organization', label: 'Organization', icon: Cog, hint: 'name + slug' },
      { href: '/app/settings/security', label: 'Passkeys', icon: KeyRound, hint: 'step-up' },
      { href: '/app/settings/edge', label: 'Edge PDP', icon: Server, hint: 'self-host install' },
      { href: '/app/settings/notifications', label: 'Notifications', icon: Layers },
      { href: '/app/guide/what-is-nomos', label: 'User guide', icon: BookOpen, hint: 'docs' },
    ],
  },
];

export function NomosShell({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="aegis" className="relative isolate min-h-screen bg-aegis-ink text-aegis-paper">
      <QuotaBanner />
      <div className="relative z-10 grid min-h-screen grid-cols-[260px_minmax(0,1fr)]">
        <Sidebar />
        <div className="flex min-h-screen flex-col">
          <Topbar />
          <main className="flex-1 px-10 py-10">{children}</main>
        </div>
      </div>
    </div>
  );
}

function QuotaBanner() {
  const usage = trpc.billing.usage.useQuery(undefined, { refetchInterval: 60_000 });
  if (!usage.data) return null;
  const { plan, percentUsed, total, cap } = usage.data;
  if (plan !== 'free') return null;
  if (percentUsed < 80) return null;
  const exhausted = total >= cap;
  return (
    <div
      className={cn(
        'sticky top-0 z-40 flex items-center justify-center gap-3 px-4 py-2 text-center text-sm font-medium shadow',
        exhausted ? 'bg-aegis-coral text-aegis-ink' : 'bg-aegis-amber text-aegis-ink',
      )}
      data-testid="quota-banner"
    >
      {exhausted ? (
        <>
          <span>
            {cap.toLocaleString()} calls reached this month. Upgrade to keep agents working.
          </span>
          <Link
            href="/app/billing"
            className="rounded-sm border border-aegis-ink/30 bg-aegis-ink/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] hover:bg-aegis-ink/20"
          >
            Upgrade
          </Link>
        </>
      ) : (
        <>
          <span>
            {(cap - total).toLocaleString()} of {cap.toLocaleString()} calls left this month
          </span>
          <Link
            href="/app/billing"
            className="rounded-sm border border-aegis-ink/30 bg-aegis-ink/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] hover:bg-aegis-ink/20"
          >
            Billing
          </Link>
        </>
      )}
    </div>
  );
}

function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 flex h-screen flex-col border-r border-aegis-line bg-aegis-ink/80 backdrop-blur">
      <Link href="/app" className="flex h-16 items-center border-b border-aegis-line px-6">
        <NomosLogo size={26} />
      </Link>

      <div className="flex-1 overflow-y-auto px-3 py-6">
        {NAV_GROUPS.map((group) => (
          <div key={group.id} className="mb-7">
            <div className="eyebrow mb-3 px-3">{group.label}</div>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active =
                  !item.external &&
                  (pathname === item.href || pathname?.startsWith(`${item.href}/`));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      target={item.external ? '_blank' : undefined}
                      rel={item.external ? 'noreferrer' : undefined}
                      className={cn(
                        'group flex items-center gap-3 rounded-sm px-3 py-2 text-sm transition-colors',
                        active
                          ? 'bg-aegis-surface-2 text-aegis-paper'
                          : 'text-aegis-mute hover:bg-aegis-surface-2/60 hover:text-aegis-paper',
                      )}
                    >
                      <item.icon
                        className={cn('h-4 w-4', active ? 'text-aegis-signal' : 'text-aegis-faint')}
                      />
                      <span className="flex-1">{item.label}</span>
                      {item.badge ? (
                        <span className="rounded-sm border border-aegis-iris/40 bg-aegis-iris/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-aegis-iris">
                          {item.badge}
                        </span>
                      ) : null}
                      {item.hint ? (
                        <span className="font-mono text-[10px] uppercase tracking-wider text-aegis-faint group-hover:text-aegis-mute">
                          {item.hint}
                        </span>
                      ) : null}
                      {item.external ? (
                        <span className="font-mono text-[10px] text-aegis-faint">↗</span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <SidebarStatus />
    </aside>
  );
}

function SidebarStatus() {
  // Cheap health proxy: if customer query loads, control plane is up.
  // Could swap for a real /healthz roll-up later — the panel is sized for it.
  const customer = trpc.customers.get.useQuery();
  const ok = !customer.isError;
  return (
    <div className="border-t border-aegis-line px-6 py-4">
      <div className="flex items-center gap-2">
        <span className="pulse" data-state={ok ? 'ok' : 'deny'} />
        <span className="eyebrow">{ok ? 'Operational' : 'Degraded'}</span>
      </div>
      <dl className="mt-3 space-y-1 font-mono text-[11px] text-aegis-mute">
        <div className="flex justify-between">
          <dt>control-plane</dt>
          <dd className={ok ? 'text-aegis-signal' : 'text-aegis-coral'}>{ok ? 'OK' : 'fail'}</dd>
        </div>
        <div className="flex justify-between">
          <dt>pdp p50</dt>
          <dd className="text-aegis-paper">~4ms</dd>
        </div>
        <div className="flex justify-between">
          <dt>region</dt>
          <dd className="text-aegis-paper">local-dev</dd>
        </div>
      </dl>
    </div>
  );
}

function Topbar() {
  const session = useSession();
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut();
    router.push('/sign-in');
  }

  const crumbs = breadcrumbs(pathname ?? '/app');

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-aegis-line bg-aegis-ink/80 px-10 backdrop-blur">
      <div className="flex items-center gap-3">
        <OrgSwitcher />
        <nav
          aria-label="Breadcrumb"
          className="hidden items-center gap-2 font-mono text-xs text-aegis-mute md:flex"
        >
          {crumbs.map((c, i) => (
            <span key={c.href} className="flex items-center gap-2">
              {i > 0 ? <span className="text-aegis-faint">/</span> : null}
              <Link
                href={c.href}
                className={cn(
                  'transition-colors hover:text-aegis-paper',
                  i === crumbs.length - 1 ? 'text-aegis-paper' : '',
                )}
              >
                {c.label}
              </Link>
            </span>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-2">
        <Link
          href="/app/guide/quickstart"
          className="hidden items-center gap-2 rounded-sm border border-aegis-line px-3 py-1.5 text-xs text-aegis-mute transition-colors hover:border-aegis-line-strong hover:text-aegis-paper md:flex"
        >
          <KeyRound className="h-3.5 w-3.5" />
          <span className="font-mono uppercase tracking-wider">Quickstart</span>
        </Link>
        <div className="flex items-center gap-2 rounded-sm border border-aegis-line bg-aegis-surface-2 px-3 py-1.5">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-aegis-line-strong font-mono text-[10px] text-aegis-paper">
            {(session.data?.user?.email ?? '?').slice(0, 1).toUpperCase()}
          </span>
          <span className="max-w-[180px] truncate text-xs text-aegis-paper">
            {session.data?.user?.email ?? '…'}
          </span>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="rounded-sm border border-aegis-line p-2 text-aegis-mute transition-colors hover:border-aegis-line-strong hover:text-aegis-paper"
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}

const ROUTE_LABEL: Record<string, string> = {
  app: 'home',
  agents: 'apps',
  audit: 'audit',
  connections: 'connections',
  policies: 'policies',
  grants: 'standing',
  swarms: 'swarms',
  approvals: 'approvals',
  billing: 'billing',
  integrations: 'marketplace',
  settings: 'settings',
  notifications: 'notifications',
  guide: 'user-guide',
  telegram: 'telegram',
  quickstart: 'quickstart',
  'what-is-nomos': 'what is nomos',
  'mental-model': 'mental model',
  organizations: 'organizations',
  members: 'members',
  invites: 'invites',
  apps: 'apps',
  'dynamic-intent': 'dynamic intent',
  'step-up': 'step-up',
  'standing-grants': 'standing grants',
  sdk: 'sdk & mcp',
  faq: 'faq',
};

function breadcrumbs(pathname: string): { href: string; label: string }[] {
  const parts = pathname.split('/').filter(Boolean);
  const out: { href: string; label: string }[] = [];
  let acc = '';
  for (const p of parts) {
    acc += `/${p}`;
    out.push({
      href: acc,
      label: ROUTE_LABEL[p] ?? p.replace(/-/g, ' '),
    });
  }
  return out.length > 0 ? out : [{ href: '/app', label: 'home' }];
}

// Tiny helper so other pages can mount a Cog-icon settings link inline.
export function SettingsCogLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-aegis-mute transition-colors hover:text-aegis-paper"
    >
      <Cog className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}
