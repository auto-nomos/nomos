'use client';

import { Check, ChevronsUpDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { trpc } from '../../lib/trpc';
import { cn } from '../../lib/utils';

const COOKIE_NAME = 'x-cb-org';

function setOrgCookie(customerId: string, maxAgeSeconds: number) {
  // Non-HttpOnly on purpose so the client can update it without a round trip.
  // context.ts re-verifies membership on every request — forging the cookie
  // to an unowned org silently falls back to the default membership.
  document.cookie = `${COOKIE_NAME}=${customerId}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax`;
}

export function OrgSwitcher() {
  const router = useRouter();
  const me = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const switchOrg = trpc.organizations.switch.useMutation({
    onSuccess: ({ customerId, maxAgeSeconds }) => {
      setOrgCookie(customerId, maxAgeSeconds);
      void utils.invalidate();
      router.refresh();
      setOpen(false);
    },
  });
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click — cheaper than wiring a real popover library.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!open) return;
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const active = me.data?.availableOrgs.find((o) => o.customerId === me.data?.activeCustomerId);
  const label = active?.displayName ?? 'Workspace';

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group flex items-center gap-2 rounded-sm border border-aegis-line bg-aegis-surface-2 px-3 py-1.5 text-sm text-aegis-paper transition-colors hover:border-aegis-line-strong"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Switch organization"
      >
        <span className="grid h-5 w-5 place-items-center rounded-[3px] bg-aegis-signal-soft font-mono text-[10px] font-semibold text-aegis-signal">
          {label.slice(0, 1).toUpperCase()}
        </span>
        <span className="max-w-[180px] truncate">{label}</span>
        {active ? (
          <span className="rounded-sm border border-aegis-line bg-aegis-ink/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-aegis-mute">
            {active.role}
          </span>
        ) : null}
        <ChevronsUpDown className="h-3.5 w-3.5 text-aegis-faint group-hover:text-aegis-mute" />
      </button>
      {open ? (
        <div
          role="listbox"
          className="absolute left-0 top-full z-40 mt-1 w-[280px] overflow-hidden rounded-sm border border-aegis-line bg-aegis-surface-2 shadow-lg"
        >
          {me.data?.availableOrgs.length === 0 ? (
            <p className="px-3 py-2 text-xs text-aegis-mute">No organizations.</p>
          ) : (
            me.data?.availableOrgs.map((o) => {
              const isActive = o.customerId === me.data?.activeCustomerId;
              return (
                <button
                  key={o.customerId}
                  type="button"
                  className={cn(
                    'flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors',
                    isActive
                      ? 'bg-aegis-surface-2 text-aegis-paper'
                      : 'text-aegis-mute hover:bg-aegis-ink/40 hover:text-aegis-paper',
                  )}
                  onClick={() => {
                    if (!isActive) switchOrg.mutate({ customerId: o.customerId });
                  }}
                  disabled={switchOrg.isPending}
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate">{o.displayName}</span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-aegis-faint">
                      {o.role} · {o.slug}
                    </span>
                  </div>
                  {isActive ? <Check className="h-4 w-4 text-aegis-signal" /> : null}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
