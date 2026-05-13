'use client';

import { LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { authClient, useSession } from '../lib/auth-client';
import { cn } from '../lib/utils';
import { Button } from './ui/button';

const NAV_ITEMS: { href: string; label: string; badge?: string }[] = [
  { href: '/app', label: 'Overview' },
  { href: '/app/agents', label: 'Apps' },
  { href: '/app/swarms', label: 'Swarms', badge: 'beta' },
  { href: '/app/connections', label: 'Connections' },
  { href: '/app/policies', label: 'Policies' },
  { href: '/app/audit', label: 'Audit' },
  { href: '/app/billing', label: 'Billing' },
];

export function AppNav() {
  const session = useSession();
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut();
    router.push('/sign-in');
  }

  return (
    <nav className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
      <div className="container flex h-14 items-center justify-between gap-6">
        <Link href="/app" className="font-semibold tracking-tight">
          Credential Broker
        </Link>
        <div className="flex flex-1 items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-muted',
                pathname === item.href || pathname?.startsWith(`${item.href}/`)
                  ? 'bg-muted font-medium text-foreground'
                  : 'text-muted-foreground',
              )}
            >
              {item.label}
              {item.badge ? (
                <span className="rounded-sm border border-aegis-iris/40 bg-aegis-iris/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-aegis-iris">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{session.data?.user?.email ?? '…'}</span>
          <Button size="sm" variant="ghost" onClick={handleSignOut} aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </nav>
  );
}
