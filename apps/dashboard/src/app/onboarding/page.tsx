'use client';

import { ArrowRight, Check, Plug } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NomosLogo } from '../../components/nomos/logo';
import { useSession } from '../../lib/auth-client';
import { type ConnectorId, startOAuthConnect } from '../../lib/oauth';
import { trpc } from '../../lib/trpc';
import { cn } from '../../lib/utils';

const CONNECTORS: { id: ConnectorId; label: string; blurb: string }[] = [
  { id: 'github', label: 'GitHub', blurb: 'issues, PRs, repo metadata' },
  { id: 'slack', label: 'Slack', blurb: 'send messages, read channels' },
  { id: 'google', label: 'Google', blurb: 'Drive, Calendar' },
  { id: 'notion', label: 'Notion', blurb: 'pages, databases' },
];

const STARTER_POLICY = `permit (
  principal,
  action == Action::"/github/issue/create",
  resource
);`;

const STEP_LABELS = ['Connect SaaS', 'Register App', 'Author policy'];

export default function OnboardingPage() {
  const router = useRouter();
  const session = useSession();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  useEffect(() => {
    if (!session.isPending && !session.data) router.replace('/sign-in');
  }, [session.isPending, session.data, router]);

  if (session.isPending || !session.data) {
    return (
      <main className="grid min-h-screen place-items-center">
        <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.18em] text-aegis-mute">
          <span className="pulse" />
          loading
        </div>
      </main>
    );
  }

  return (
    <main className="relative z-10 mx-auto max-w-[920px] px-6 py-16 md:px-10">
      <header className="flex items-center justify-between">
        <Link href="/" aria-label="Nomos home">
          <NomosLogo size={24} />
        </Link>
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-mute">
          step {step} of 3
        </span>
      </header>

      <div className="mt-16">
        <div className="eyebrow">welcome</div>
        <h1 className="display mt-4 text-[56px] leading-tight text-aegis-paper">
          Three steps to your
          <br />
          first <em>authorized</em> call.
        </h1>
        <p className="mt-5 max-w-[520px] text-sm leading-relaxed text-aegis-mute">
          Connect a SaaS, register the agent that will call into Nomos, save a starter policy.
          We&rsquo;ll drop you into the dashboard when you&rsquo;re done.
        </p>
      </div>

      <Stepper step={step} />

      <section className="mt-12">
        {step === 1 ? <ConnectStep onNext={() => setStep(2)} /> : null}
        {step === 2 ? <AgentStep onNext={() => setStep(3)} /> : null}
        {step === 3 ? <PolicyStep onDone={() => router.push('/app')} /> : null}
      </section>
    </main>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <ol className="mt-10 grid grid-cols-3 gap-px overflow-hidden rounded-sm border border-aegis-line bg-aegis-line">
      {STEP_LABELS.map((label, i) => {
        const idx = (i + 1) as 1 | 2 | 3;
        const active = idx === step;
        const done = idx < step;
        return (
          <li
            key={label}
            className={cn(
              'flex items-center gap-3 px-5 py-4 transition-colors',
              active && 'bg-aegis-surface-2',
              done && 'bg-aegis-surface',
              !active && !done && 'bg-aegis-ink',
            )}
          >
            <span
              className={cn(
                'grid h-6 w-6 place-items-center rounded-full font-mono text-[10px]',
                done
                  ? 'bg-aegis-signal text-aegis-ink'
                  : active
                    ? 'bg-aegis-paper text-aegis-ink'
                    : 'border border-aegis-line text-aegis-mute',
              )}
            >
              {done ? <Check className="h-3 w-3" /> : idx}
            </span>
            <span
              className={cn(
                'font-mono text-[11px] uppercase tracking-[0.16em]',
                active ? 'text-aegis-paper' : done ? 'text-aegis-mute' : 'text-aegis-faint',
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function PanelShell({
  eyebrow,
  title,
  copy,
  children,
  footer,
}: {
  eyebrow: string;
  title: React.ReactNode;
  copy: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="rounded-sm border border-aegis-line bg-aegis-surface/40 p-8 backdrop-blur md:p-10">
      <div className="eyebrow">{eyebrow}</div>
      <h2 className="display mt-4 text-[36px] leading-tight text-aegis-paper">{title}</h2>
      <p className="mt-3 max-w-[480px] text-sm leading-relaxed text-aegis-mute">{copy}</p>
      <div className="mt-8">{children}</div>
      {footer ? <div className="mt-8 border-t border-aegis-line pt-6">{footer}</div> : null}
    </div>
  );
}

function ConnectStep({ onNext }: { onNext: () => void }) {
  const [pending, setPending] = useState<ConnectorId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const connections = trpc.oauth.list.useQuery();
  const connectedSet = new Set((connections.data ?? []).map((c) => c.connector));

  async function connect(id: ConnectorId) {
    setError(null);
    setPending(id);
    try {
      const res = await startOAuthConnect(id);
      window.location.href = res.authUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'connect failed');
      setPending(null);
    }
  }

  return (
    <PanelShell
      eyebrow="step 01 · connect"
      title={
        <>
          Connect your <em>first</em> SaaS.
        </>
      }
      copy="Your code never holds tokens. Nomos stores the refresh token encrypted; the PDP borrows a fresh access token per call after policy says yes."
      footer={
        <div className="flex items-center justify-between">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-faint">
            don&rsquo;t have an OAuth app yet? skip — connect later.
          </p>
          <button
            type="button"
            onClick={onNext}
            className="group inline-flex items-center gap-2 rounded-sm border border-aegis-line px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-paper transition-colors hover:border-aegis-line-strong"
          >
            Skip for now
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      }
    >
      <div className="grid gap-px overflow-hidden rounded-sm border border-aegis-line bg-aegis-line sm:grid-cols-2">
        {CONNECTORS.map((c) => {
          const connected = connectedSet.has(c.id);
          return (
            <div key={c.id} className="flex flex-col gap-3 bg-aegis-ink p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-sm border border-aegis-line bg-aegis-surface font-mono text-[11px] text-aegis-paper">
                    {c.label.slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <p className="font-display text-[18px] text-aegis-paper">{c.label}</p>
                    <p className="text-xs text-aegis-mute">{c.blurb}</p>
                  </div>
                </div>
                {connected ? (
                  <span className="rounded-sm border border-aegis-signal/40 bg-aegis-signal/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-aegis-signal">
                    connected
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => connect(c.id)}
                disabled={pending !== null || connected}
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-sm border px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] transition-colors disabled:opacity-50',
                  connected
                    ? 'border-aegis-line text-aegis-mute'
                    : 'border-aegis-line bg-aegis-surface-2 text-aegis-paper hover:border-aegis-line-strong',
                )}
              >
                <Plug className="h-3.5 w-3.5" />
                {pending === c.id ? 'redirecting…' : connected ? 'connected' : 'connect'}
              </button>
            </div>
          );
        })}
      </div>
      {error ? (
        <div
          role="alert"
          className="mt-4 rounded-sm border border-aegis-coral/40 bg-aegis-coral/10 px-4 py-3 font-mono text-xs text-aegis-coral"
        >
          {error}
        </div>
      ) : null}
    </PanelShell>
  );
}

function AgentStep({ onNext }: { onNext: () => void }) {
  const [name, setName] = useState('release-bot');
  const [error, setError] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const create = trpc.agents.create.useMutation({
    onSuccess: () => {
      utils.agents.list.invalidate();
      onNext();
    },
    onError: (err) => setError(err.message),
  });

  return (
    <PanelShell
      eyebrow="step 02 · register"
      title={
        <>
          Register your <em>first</em> App.
        </>
      }
      copy="An App is the credential slot for one piece of code that calls our PDP — your AI agent, MCP server, script, or service. Each App gets a stable DID + API key, revealed once on the detail page."
      footer={
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => create.mutate({ name })}
            disabled={create.isPending || !name}
            className="group inline-flex items-center gap-2 rounded-sm bg-aegis-signal px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-ink transition-colors hover:bg-aegis-signal/90 disabled:opacity-50"
          >
            {create.isPending ? 'creating…' : 'register App'}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      }
    >
      <div>
        <label
          htmlFor="agent-name"
          className="block font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint"
        >
          App name
        </label>
        <input
          id="agent-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="release-bot"
          className="mt-2 block w-full rounded-sm border border-aegis-line bg-aegis-ink px-4 py-3 text-sm text-aegis-paper placeholder:text-aegis-faint focus:border-aegis-signal focus:outline-none focus:ring-1 focus:ring-aegis-signal/40"
        />
      </div>
      {error ? (
        <div
          role="alert"
          className="mt-4 rounded-sm border border-aegis-coral/40 bg-aegis-coral/10 px-4 py-3 font-mono text-xs text-aegis-coral"
        >
          {error}
        </div>
      ) : null}
    </PanelShell>
  );
}

function PolicyStep({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('Default policy');
  const [text, setText] = useState(STARTER_POLICY);
  const [error, setError] = useState<string | null>(null);
  const upsert = trpc.policies.upsert.useMutation({
    onSuccess: () => onDone(),
    onError: (err) => setError(err.message),
  });

  return (
    <PanelShell
      eyebrow="step 03 · author"
      title={
        <>
          Save a <em>starter</em> policy.
        </>
      }
      copy="Cedar policy enforced at the PDP. Tweak later in the policy editor — visual or text, your choice."
      footer={
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onDone}
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-mute hover:text-aegis-paper"
          >
            skip and finish
          </button>
          <button
            type="button"
            onClick={() => upsert.mutate({ name, cedarText: text })}
            disabled={upsert.isPending || !name || !text}
            className="group inline-flex items-center gap-2 rounded-sm bg-aegis-signal px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-ink transition-colors hover:bg-aegis-signal/90 disabled:opacity-50"
          >
            {upsert.isPending ? 'saving…' : 'finish'}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <label
            htmlFor="policy-name"
            className="block font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint"
          >
            Policy name
          </label>
          <input
            id="policy-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-2 block w-full rounded-sm border border-aegis-line bg-aegis-ink px-4 py-3 text-sm text-aegis-paper focus:border-aegis-signal focus:outline-none focus:ring-1 focus:ring-aegis-signal/40"
          />
        </div>
        <div>
          <label
            htmlFor="cedar"
            className="block font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint"
          >
            Cedar text
          </label>
          <textarea
            id="cedar"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={9}
            className="mt-2 block w-full rounded-sm border border-aegis-line bg-aegis-ink px-4 py-3 font-mono text-xs text-aegis-paper focus:border-aegis-signal focus:outline-none focus:ring-1 focus:ring-aegis-signal/40"
          />
        </div>
      </div>
      {error ? (
        <div
          role="alert"
          className="mt-4 rounded-sm border border-aegis-coral/40 bg-aegis-coral/10 px-4 py-3 font-mono text-xs text-aegis-coral"
        >
          {error}
        </div>
      ) : null}
    </PanelShell>
  );
}
