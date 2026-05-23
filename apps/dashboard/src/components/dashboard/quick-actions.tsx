'use client';

import { Bot, FileLock2, Plug, UserPlus } from 'lucide-react';
import Link from 'next/link';

const ACTIONS = [
  {
    href: '/app/agents/new',
    icon: Bot,
    label: 'New app',
    hint: 'Register agent · mint API key',
  },
  {
    href: '/app/policies/new',
    icon: FileLock2,
    label: 'New policy',
    hint: 'Cedar rule · visual builder',
  },
  {
    href: '/app/connections',
    icon: Plug,
    label: 'Connect SaaS',
    hint: 'Bind GitHub · Slack · …',
  },
  {
    href: '/app/settings/members',
    icon: UserPlus,
    label: 'Invite member',
    hint: 'Workspace seat · role',
  },
] as const;

export function QuickActions() {
  return (
    <section
      aria-label="Quick actions"
      className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-aegis-line bg-aegis-line md:grid-cols-4"
    >
      {ACTIONS.map(({ href, icon: Icon, label, hint }) => (
        <Link
          key={href}
          href={href}
          className="group flex items-center gap-3 bg-aegis-surface px-5 py-4 transition-colors hover:bg-aegis-surface-2"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-sm border border-aegis-line bg-aegis-ink/40 text-aegis-signal transition-colors group-hover:border-aegis-signal/40">
            <Icon className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-aegis-paper">{label}</span>
            <span className="mt-0.5 block truncate font-mono text-[10px] uppercase tracking-wider text-aegis-faint">
              {hint}
            </span>
          </span>
        </Link>
      ))}
    </section>
  );
}
