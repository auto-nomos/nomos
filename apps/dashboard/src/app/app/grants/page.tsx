'use client';

import { ArrowUpRight, ShieldAlert, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { formatEnvelopeAsk } from '../../../lib/format-envelope';
import { trpc } from '../../../lib/trpc';
import { cn } from '../../../lib/utils';

/* ======================================================================
   Standing grants — durable envelopes that survive past a session.
   Cross-agent overview. The agent detail page still shows session +
   standing rows together; this screen is the audit-friendly summary.
   ====================================================================== */

export default function StandingGrantsPage() {
  const envelopes = trpc.envelopes.list.useQuery({});
  const utils = trpc.useUtils();
  const revoke = trpc.envelopes.revoke.useMutation({
    onSuccess: () => utils.envelopes.list.invalidate(),
  });
  const [filter, setFilter] = useState<'all' | 'standing' | 'session'>('all');

  const all = envelopes.data ?? [];
  const filtered = all.filter((e) => {
    if (filter === 'standing') return e.isStanding;
    if (filter === 'session') return !e.isStanding;
    return true;
  });
  const standingCount = all.filter((e) => e.isStanding).length;
  const sessionCount = all.length - standingCount;

  return (
    <div className="mx-auto max-w-[1180px] space-y-10">
      <header>
        <div className="eyebrow">runtime · grants</div>
        <h1 className="display mt-4 text-[56px] text-aegis-paper">
          Standing <em>grants</em>.
        </h1>
        <p className="mt-5 max-w-[640px] text-base text-aegis-mute">
          Durable envelopes survive every session until you revoke them. They&rsquo;re an attack
          surface — keep this list trim and review it as you would SSH keys.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Tab
          active={filter === 'all'}
          onClick={() => setFilter('all')}
          label="all"
          count={all.length}
        />
        <Tab
          active={filter === 'standing'}
          onClick={() => setFilter('standing')}
          label="standing"
          count={standingCount}
          tone="signal"
        />
        <Tab
          active={filter === 'session'}
          onClick={() => setFilter('session')}
          label="session"
          count={sessionCount}
          tone="iris"
        />
      </div>

      <article className="overflow-hidden rounded-sm border border-aegis-line bg-aegis-surface">
        <div className="grid grid-cols-[120px_minmax(0,1fr)_160px_160px_120px] border-b border-aegis-line px-6 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
          <span>type</span>
          <span>scope · actions</span>
          <span>expires</span>
          <span>created</span>
          <span className="text-right">action</span>
        </div>
        {envelopes.isPending ? (
          <Empty>Loading grants…</Empty>
        ) : filtered.length === 0 ? (
          <Empty>
            No grants matching this filter. Standing grants are created from the approve page when
            you choose <code>Standing</code> instead of <code>Session</code>.
          </Empty>
        ) : (
          <ul className="divide-y divide-aegis-line">
            {filtered.map((e) => {
              const ttlSeconds = e.expiresAt
                ? Math.max(0, Math.floor((new Date(e.expiresAt).getTime() - Date.now()) / 1000))
                : null;
              return (
                <li
                  key={e.id}
                  className="grid grid-cols-[120px_minmax(0,1fr)_160px_160px_120px] items-center gap-4 px-6 py-4"
                >
                  <span
                    className={cn(
                      'inline-flex w-fit items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em]',
                      e.isStanding
                        ? 'border-aegis-signal/40 bg-aegis-signal/10 text-aegis-signal'
                        : 'border-aegis-iris/40 bg-aegis-iris/10 text-aegis-iris',
                    )}
                  >
                    {e.isStanding ? (
                      <ShieldCheck className="h-3 w-3" />
                    ) : (
                      <ShieldAlert className="h-3 w-3" />
                    )}
                    {e.isStanding ? 'standing' : 'session'}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-mono text-sm text-aegis-paper">
                      {formatEnvelopeAsk({
                        constraint: e.constraint as Parameters<
                          typeof formatEnvelopeAsk
                        >[0]['constraint'],
                        actions: e.actions as string[],
                        ttlSeconds,
                      })}
                    </div>
                    <div className="mt-1 truncate font-mono text-[11px] text-aegis-mute">
                      {(e.actions as string[]).join(', ')}
                    </div>
                  </div>
                  <span className="font-mono text-xs text-aegis-mute">
                    {e.expiresAt ? new Date(e.expiresAt).toLocaleString() : 'until revoked'}
                  </span>
                  <span className="font-mono text-xs text-aegis-faint">
                    {new Date(e.createdAt).toLocaleDateString()}
                  </span>
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => revoke.mutate({ id: e.id })}
                      disabled={revoke.isPending}
                      className="rounded-sm border border-aegis-line px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-aegis-coral transition-colors hover:border-aegis-coral/60 hover:bg-aegis-coral/10 disabled:opacity-50"
                    >
                      revoke
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </article>

      <div className="rounded-sm border border-aegis-amber/30 bg-aegis-amber/5 px-6 py-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-amber">
          security note
        </div>
        <p className="mt-2 text-sm leading-relaxed text-aegis-paper/90">
          Standing grants always require a passkey + step-up to <em>create</em>. After that they
          silently mint UCANs in their scope. Treat them like long-lived API keys — least scope,
          smallest set, periodic review.
        </p>
        <Link
          href="/app/guide#standing-grants"
          className="mt-3 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-paper hover:text-aegis-amber"
        >
          read more in the user guide
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function Tab({
  active,
  label,
  count,
  tone = 'paper',
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  tone?: 'paper' | 'signal' | 'iris';
  onClick: () => void;
}) {
  const toneClass = {
    paper: 'text-aegis-paper',
    signal: 'text-aegis-signal',
    iris: 'text-aegis-iris',
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-sm border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] transition-colors',
        active
          ? 'border-aegis-line-strong bg-aegis-surface-2 text-aegis-paper'
          : 'border-aegis-line text-aegis-mute hover:border-aegis-line-strong hover:text-aegis-paper',
      )}
    >
      <span>{label}</span>
      <span className={cn('tabular-nums', toneClass)}>{count.toString().padStart(2, '0')}</span>
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-6 py-14 text-center text-sm text-aegis-mute">{children}</div>;
}
