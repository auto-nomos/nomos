'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { cn } from '../../lib/utils';

const OPTIONS = [
  { value: 7, label: '7d' },
  { value: 30, label: '30d' },
] as const;

export function useWindowDays(): number {
  const sp = useSearchParams();
  const raw = Number(sp.get('w'));
  return raw === 30 ? 30 : 7;
}

export function WindowSelect() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const active = useWindowDays();

  const set = useCallback(
    (w: number) => {
      const next = new URLSearchParams(sp);
      if (w === 7) next.delete('w');
      else next.set('w', String(w));
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, sp],
  );

  return (
    <div
      role="tablist"
      aria-label="Time window"
      className="inline-flex items-center gap-px rounded-sm border border-aegis-line bg-aegis-surface p-0.5"
    >
      {OPTIONS.map((opt) => {
        const selected = opt.value === active;
        return (
          <button
            type="button"
            key={opt.value}
            role="tab"
            aria-selected={selected}
            onClick={() => set(opt.value)}
            className={cn(
              'rounded-[2px] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] transition-colors',
              selected
                ? 'bg-aegis-signal text-aegis-ink'
                : 'text-aegis-mute hover:text-aegis-paper',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
