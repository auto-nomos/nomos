'use client';

import { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';

export type AccessPath = 'cli' | 'mcp' | 'sdk';

const PATH_ORDER: { id: AccessPath; label: string; sub: string }[] = [
  { id: 'cli', label: 'CLI', sub: '@auto-nomos/cli' },
  { id: 'mcp', label: 'MCP', sub: '@auto-nomos/mcp-server' },
  { id: 'sdk', label: 'SDK', sub: '@auto-nomos/sdk' },
];

const STORAGE_KEY = 'nomos.get-started.path';
const SYNC_EVENT = 'nomos:get-started-path';

interface Panes {
  cli?: React.ReactNode;
  mcp?: React.ReactNode;
  sdk?: React.ReactNode;
}

export function PathTabs({
  panes,
  defaultPath = 'sdk',
}: {
  panes: Panes;
  defaultPath?: AccessPath;
}) {
  const [active, setActive] = useState<AccessPath>(defaultPath);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'cli' || stored === 'mcp' || stored === 'sdk') {
        setActive(stored);
      }
    } catch {
      /* localStorage denied */
    }
    const onSync = (e: Event) => {
      const detail = (e as CustomEvent<AccessPath>).detail;
      if (detail === 'cli' || detail === 'mcp' || detail === 'sdk') {
        setActive(detail);
      }
    };
    window.addEventListener(SYNC_EVENT, onSync);
    return () => window.removeEventListener(SYNC_EVENT, onSync);
  }, []);

  const select = (id: AccessPath) => {
    setActive(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* localStorage denied */
    }
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: id }));
  };

  const activePane = panes[active] ?? panes.sdk ?? panes.cli ?? panes.mcp ?? null;

  return (
    <div className="overflow-hidden rounded-sm border border-aegis-line bg-aegis-surface/40">
      <div className="grid grid-cols-3 border-b border-aegis-line bg-aegis-ink/60">
        {PATH_ORDER.map((p) => {
          const has = panes[p.id] !== undefined;
          const isActive = active === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => has && select(p.id)}
              disabled={!has}
              className={cn(
                'border-r border-aegis-line px-5 py-4 text-left transition-colors last:border-r-0',
                isActive ? 'bg-aegis-surface/60' : 'text-aegis-mute hover:bg-aegis-surface/30',
                !has && 'cursor-not-allowed opacity-30',
              )}
            >
              <div
                className={cn(
                  'font-mono text-[11px] uppercase tracking-[0.18em]',
                  isActive ? 'text-aegis-signal' : 'text-aegis-faint',
                )}
              >
                {p.label}
              </div>
              <div className="mt-1 font-mono text-[10px] text-aegis-faint">{p.sub}</div>
            </button>
          );
        })}
      </div>
      <div className="p-6">{activePane}</div>
    </div>
  );
}

export function PaneShell({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
        {caption}
      </div>
      <pre className="overflow-x-auto rounded-sm border border-aegis-line bg-aegis-ink p-5 font-mono text-[12.5px] leading-[1.65] text-aegis-paper">
        {children}
      </pre>
    </div>
  );
}
