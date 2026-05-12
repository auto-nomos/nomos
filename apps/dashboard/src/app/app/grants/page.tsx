'use client';

import { ArrowUpRight, ShieldAlert, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { formatEnvelopeAsk } from '../../../lib/format-envelope';
import { trpc } from '../../../lib/trpc';
import { cn } from '../../../lib/utils';

/* ======================================================================
   Standing grants — durable grants of two kinds:
     1. Envelopes: passkey-cosigned UCAN factories created via /v1/intent.
        Always require step-up to create. Best for "let agent act inside
        this scope for the next 30m / until revoked."
     2. Remembered decisions: cedar rules written when an operator tapped
        "Always allow / Always deny" on a step-up. Best for "always allow
        this exact (command, resource) for this agent."
   Both are durable. The agent detail page shows the same data scoped to
   one agent; this screen is the cross-agent overview.
   ====================================================================== */

type Klass = 'envelopes' | 'remembered';

export default function StandingGrantsPage() {
  const [klass, setKlass] = useState<Klass>('envelopes');
  const envelopes = trpc.envelopes.list.useQuery({});
  const grants = trpc.grants.list.useQuery();
  const utils = trpc.useUtils();
  const revokeEnvelope = trpc.envelopes.revoke.useMutation({
    onSuccess: () => utils.envelopes.list.invalidate(),
  });
  const revokeGrant = trpc.grants.revoke.useMutation({
    onSuccess: () => utils.grants.list.invalidate(),
  });
  const toggleGrant = trpc.grants.toggle.useMutation({
    onSuccess: () => utils.grants.list.invalidate(),
  });
  const [envFilter, setEnvFilter] = useState<'all' | 'standing' | 'session'>('all');

  const allEnv = envelopes.data ?? [];
  const filteredEnv = allEnv.filter((e) => {
    if (envFilter === 'standing') return e.isStanding;
    if (envFilter === 'session') return !e.isStanding;
    return true;
  });
  const standingCount = allEnv.filter((e) => e.isStanding).length;
  const sessionCount = allEnv.length - standingCount;
  const allGrants = grants.data ?? [];

  return (
    <div className="mx-auto max-w-[1180px] space-y-10">
      <header>
        <div className="eyebrow">runtime · durable approvals</div>
        <h1 className="display mt-4 text-[56px] text-aegis-paper">
          Standing <em>grants</em>.
        </h1>
        <p className="mt-5 max-w-[700px] text-base text-aegis-mute">
          Two flavours of durable approval. <strong>Envelopes</strong> are passkey-cosigned scopes
          that let an agent silently mint UCANs inside a constraint.{' '}
          <strong>Remembered decisions</strong> are auto-allow / auto-deny rules written when you
          tapped "Always" on a step-up. Both survive sessions until you revoke them — treat them
          like SSH keys.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <ClassTab
          active={klass === 'envelopes'}
          onClick={() => setKlass('envelopes')}
          label="Envelopes"
          count={allEnv.length}
        />
        <ClassTab
          active={klass === 'remembered'}
          onClick={() => setKlass('remembered')}
          label="Remembered"
          count={allGrants.length}
        />
      </div>

      {klass === 'envelopes' ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Tab
              active={envFilter === 'all'}
              onClick={() => setEnvFilter('all')}
              label="all"
              count={allEnv.length}
            />
            <Tab
              active={envFilter === 'standing'}
              onClick={() => setEnvFilter('standing')}
              label="standing"
              count={standingCount}
              tone="signal"
            />
            <Tab
              active={envFilter === 'session'}
              onClick={() => setEnvFilter('session')}
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
              <Empty>Loading envelopes…</Empty>
            ) : filteredEnv.length === 0 ? (
              <Empty>
                No envelopes matching this filter. Envelopes are created by an agent calling{' '}
                <code>/v1/intent</code> while in dynamic mode; you approve them at the
                <code> /approve/&lt;id&gt;</code> page with passkey + a Standing/Session choice.
              </Empty>
            ) : (
              <ul className="divide-y divide-aegis-line">
                {filteredEnv.map((e) => {
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
                          onClick={() => revokeEnvelope.mutate({ id: e.id })}
                          disabled={revokeEnvelope.isPending}
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
        </>
      ) : (
        <article className="overflow-hidden rounded-sm border border-aegis-line bg-aegis-surface">
          <div className="grid grid-cols-[100px_140px_minmax(0,1fr)_100px_140px_160px] border-b border-aegis-line px-6 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
            <span>decision</span>
            <span>agent</span>
            <span>command · resource</span>
            <span>scope</span>
            <span>granted</span>
            <span className="text-right">action</span>
          </div>
          {grants.isPending ? (
            <Empty>Loading remembered decisions…</Empty>
          ) : allGrants.length === 0 ? (
            <Empty>
              No remembered decisions. The next time an agent hits a step-up, tap{' '}
              <strong>Always allow</strong> or <strong>Always deny</strong> in the dashboard or
              Telegram to write a row here.
            </Empty>
          ) : (
            <ul className="divide-y divide-aegis-line">
              {allGrants.map((g) => (
                <li
                  key={g.id}
                  className="grid grid-cols-[100px_140px_minmax(0,1fr)_100px_140px_160px] items-center gap-4 px-6 py-4"
                >
                  <span
                    className={cn(
                      'inline-flex w-fit items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em]',
                      g.decision === 'allow'
                        ? 'border-aegis-signal/40 bg-aegis-signal/10 text-aegis-signal'
                        : 'border-aegis-coral/40 bg-aegis-coral/10 text-aegis-coral',
                    )}
                  >
                    {g.decision}
                  </span>
                  <span className="truncate font-mono text-xs text-aegis-mute">
                    {g.agentName ?? g.agentId.slice(0, 8)}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-mono text-sm text-aegis-paper">{g.command}</div>
                    <div className="mt-1 truncate font-mono text-[11px] text-aegis-mute">
                      {JSON.stringify(g.resourcePattern)}
                    </div>
                  </div>
                  <span className="font-mono text-[11px] text-aegis-mute">{g.scope}</span>
                  <span className="font-mono text-xs text-aegis-faint">
                    {new Date(g.grantedAt).toLocaleString()}
                  </span>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => toggleGrant.mutate({ grantId: g.id })}
                      disabled={toggleGrant.isPending}
                      className="rounded-sm border border-aegis-line px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-aegis-paper transition-colors hover:border-aegis-line-strong hover:bg-aegis-surface-2 disabled:opacity-50"
                    >
                      flip
                    </button>
                    <button
                      type="button"
                      onClick={() => revokeGrant.mutate({ grantId: g.id })}
                      disabled={revokeGrant.isPending}
                      className="rounded-sm border border-aegis-line px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-aegis-coral transition-colors hover:border-aegis-coral/60 hover:bg-aegis-coral/10 disabled:opacity-50"
                    >
                      revoke
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>
      )}

      <div className="rounded-sm border border-aegis-amber/30 bg-aegis-amber/5 px-6 py-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-amber">
          security note
        </div>
        <p className="mt-2 text-sm leading-relaxed text-aegis-paper/90">
          Standing approvals always require a passkey or Telegram "Always" tap to <em>create</em>.
          After that they unlock silent mints / silent allows inside their scope. Treat them like
          long-lived API keys — least scope, smallest set, periodic review.
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

function ClassTab({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-sm border px-4 py-2 font-mono text-[12px] uppercase tracking-[0.16em] transition-colors',
        active
          ? 'border-aegis-paper bg-aegis-surface-2 text-aegis-paper'
          : 'border-aegis-line text-aegis-mute hover:border-aegis-line-strong hover:text-aegis-paper',
      )}
    >
      <span>{label}</span>
      <span className="tabular-nums text-aegis-paper">{count.toString().padStart(2, '0')}</span>
    </button>
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
