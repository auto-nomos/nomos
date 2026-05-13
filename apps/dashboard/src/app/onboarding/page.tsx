'use client';

import { templatesFor } from '@auto-nomos/schema-packs';
import { ArrowRight, Check, Copy, Plug, Terminal } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NomosLogo } from '../../components/nomos/logo';
import { useSession } from '../../lib/auth-client';
import { clientEnv } from '../../lib/env';
import { type ConnectorId, startOAuthConnect } from '../../lib/oauth';
import { trpc } from '../../lib/trpc';
import { cn } from '../../lib/utils';

const CONNECTORS: { id: ConnectorId; label: string; blurb: string }[] = [
  { id: 'github', label: 'GitHub', blurb: 'issues, PRs, repo metadata' },
  { id: 'slack', label: 'Slack', blurb: 'send messages, read channels' },
  { id: 'google', label: 'Google', blurb: 'Drive, Calendar' },
  { id: 'notion', label: 'Notion', blurb: 'pages, databases' },
];

const STEP_LABELS = [
  'Connect SaaS',
  'Register App',
  'Author policy',
  'Mint UCAN',
  'First call',
  'Audit',
];
type StepIndex = 1 | 2 | 3 | 4 | 5 | 6;

interface WizardState {
  step: StepIndex;
  agentId: string | null;
  agentName: string | null;
  policyId: string | null;
  apiKey: string | null;
  apiKeyName: string | null;
}

const INITIAL_STATE: WizardState = {
  step: 1,
  agentId: null,
  agentName: null,
  policyId: null,
  apiKey: null,
  apiKeyName: null,
};

const STORAGE_KEY = 'nomos:onboarding';

function loadState(): WizardState {
  if (typeof window === 'undefined') return INITIAL_STATE;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_STATE;
    const parsed = JSON.parse(raw) as Partial<WizardState>;
    return {
      step: (parsed.step as StepIndex) ?? 1,
      agentId: parsed.agentId ?? null,
      agentName: parsed.agentName ?? null,
      policyId: parsed.policyId ?? null,
      apiKey: parsed.apiKey ?? null,
      apiKeyName: parsed.apiKeyName ?? null,
    };
  } catch {
    return INITIAL_STATE;
  }
}

function saveState(s: WizardState) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export default function OnboardingPage() {
  const router = useRouter();
  const session = useSession();
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(loadState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveState(state);
  }, [state, hydrated]);

  useEffect(() => {
    if (!session.isPending && !session.data) router.replace('/sign-in');
  }, [session.isPending, session.data, router]);

  function update(patch: Partial<WizardState>) {
    setState((prev) => ({ ...prev, ...patch }));
  }

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

  const percentDone = Math.round(((state.step - 1) / STEP_LABELS.length) * 100);

  return (
    <main className="relative z-10 mx-auto max-w-[960px] px-6 py-16 md:px-10">
      <header className="flex items-center justify-between">
        <Link href="/" aria-label="Nomos home">
          <NomosLogo size={24} />
        </Link>
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-mute">
          step {state.step} of {STEP_LABELS.length} · {percentDone}%
        </span>
      </header>

      <div className="mt-16">
        <div className="eyebrow">welcome</div>
        <h1 className="display mt-4 text-[56px] leading-tight text-aegis-paper">
          Six steps to your
          <br />
          first <em>authorized</em> call.
        </h1>
        <p className="mt-5 max-w-[540px] text-sm leading-relaxed text-aegis-mute">
          Connect a SaaS, register the App that will call into Nomos, save a starter policy, mint a
          UCAN, run a real curl. We&rsquo;ll drop you into the audit chain at the end.
        </p>
      </div>

      <Stepper step={state.step} />

      <section className="mt-12">
        {state.step === 1 ? <ConnectStep onNext={() => update({ step: 2 })} /> : null}
        {state.step === 2 ? (
          <AgentStep
            onNext={(agent) => update({ step: 3, agentId: agent.id, agentName: agent.name })}
          />
        ) : null}
        {state.step === 3 ? (
          <PolicyStep
            agentId={state.agentId}
            onBack={() => update({ step: 2 })}
            onNext={(policyId) => update({ step: 4, policyId })}
          />
        ) : null}
        {state.step === 4 ? (
          <KeyStep
            agentId={state.agentId}
            agentName={state.agentName}
            onBack={() => update({ step: 3 })}
            onNext={(apiKey, apiKeyName) => update({ step: 5, apiKey, apiKeyName })}
          />
        ) : null}
        {state.step === 5 ? (
          <CurlStep
            apiKey={state.apiKey}
            apiKeyName={state.apiKeyName}
            onBack={() => update({ step: 4 })}
            onNext={() => update({ step: 6 })}
            onSkip={() => update({ step: 6 })}
          />
        ) : null}
        {state.step === 6 ? (
          <DoneStep
            onFinish={() => {
              sessionStorage.removeItem(STORAGE_KEY);
              router.push('/app/audit');
            }}
          />
        ) : null}
      </section>
    </main>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <ol className="mt-10 grid grid-cols-3 gap-px overflow-hidden rounded-sm border border-aegis-line bg-aegis-line md:grid-cols-6">
      {STEP_LABELS.map((label, i) => {
        const idx = i + 1;
        const active = idx === step;
        const done = idx < step;
        return (
          <li
            key={label}
            className={cn(
              'flex items-center gap-3 px-4 py-4 transition-colors',
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
  const hasConnection = connectedSet.size > 0;

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
            {hasConnection
              ? 'you have at least one connection — continue'
              : 'an OAuth connection is required before the next step'}
          </p>
          <button
            type="button"
            onClick={onNext}
            disabled={!hasConnection}
            className="group inline-flex items-center gap-2 rounded-sm bg-aegis-signal px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-ink transition-colors hover:bg-aegis-signal/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue
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

interface CreatedAgent {
  id: string;
  name: string;
}

function AgentStep({ onNext }: { onNext: (agent: CreatedAgent) => void }) {
  const [name, setName] = useState('release-bot');
  const [error, setError] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const create = trpc.agents.create.useMutation({
    onSuccess: (agent) => {
      utils.agents.list.invalidate();
      onNext({ id: agent.id, name: agent.name });
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
      copy="An App is the credential slot for one piece of code that calls our PDP — your AI agent, MCP server, script, or service. Each App gets a stable DID + API key, revealed once on the next step."
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

function PolicyStep({
  agentId,
  onBack,
  onNext,
}: {
  agentId: string | null;
  onBack: () => void;
  onNext: (policyId: string) => void;
}) {
  const githubTemplates = templatesFor('github');
  const seedTemplate = githubTemplates[0];
  const seedText =
    seedTemplate?.cedarText ??
    `permit (\n  principal,\n  action == Action::"/github/issue/create",\n  resource\n);`;
  const [name, setName] = useState(seedTemplate?.name ?? 'github-starter');
  const [text, setText] = useState(seedText);
  const [bindToApp, setBindToApp] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const assign = trpc.agents.assignPolicies.useMutation();
  const upsert = trpc.policies.upsert.useMutation({
    onSuccess: async (p) => {
      if (bindToApp && agentId) {
        try {
          await assign.mutateAsync({ agentId, policyIds: [p.id] });
        } catch (err) {
          setError(`policy saved but mapping failed: ${(err as Error).message}`);
          return;
        }
      }
      onNext(p.id);
    },
    onError: (err) => setError(err.message),
  });

  return (
    <PanelShell
      eyebrow="step 03 · author"
      title={
        <>
          Save your <em>first</em> policy.
        </>
      }
      copy="Pre-seeded with a GitHub starter. The PDP enforces it on every call your App makes. Visual editing lives at /app/policies after onboarding."
      footer={
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-mute hover:text-aegis-paper"
          >
            ← back
          </button>
          <button
            type="button"
            onClick={() => upsert.mutate({ name, cedarText: text, integrationId: 'github' })}
            disabled={upsert.isPending || !name || !text}
            className="group inline-flex items-center gap-2 rounded-sm bg-aegis-signal px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-ink transition-colors hover:bg-aegis-signal/90 disabled:opacity-50"
          >
            {upsert.isPending ? 'saving…' : 'save policy'}
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
        <label className="flex items-start gap-3 rounded-sm border border-aegis-line bg-aegis-ink/40 px-4 py-3">
          <input
            type="checkbox"
            checked={bindToApp}
            onChange={(e) => setBindToApp(e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-xs leading-relaxed text-aegis-mute">
            <span className="font-mono uppercase tracking-[0.16em] text-aegis-paper">
              Map to this App
            </span>
            <br />
            Apps default-deny every command until a policy is mapped. Leave checked so this App can
            use the policy you just authored. You can map it to other Apps later from the
            policy&apos;s detail page.
          </span>
        </label>
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

function KeyStep({
  agentId,
  agentName,
  onBack,
  onNext,
}: {
  agentId: string | null;
  agentName: string | null;
  onBack: () => void;
  onNext: (plaintext: string, name: string) => void;
}) {
  const [keyName, setKeyName] = useState(`${agentName ?? 'app'}-key`);
  const [error, setError] = useState<string | null>(null);
  const create = trpc.apiKeys.create.useMutation({
    onSuccess: (res) => onNext(res.plaintextOnce, res.name),
    onError: (err) => setError(err.message),
  });

  if (!agentId) {
    return (
      <PanelShell
        eyebrow="step 04 · mint"
        title="Missing App"
        copy="No App registered in this session. Go back to step 2."
      >
        <button
          type="button"
          onClick={onBack}
          className="font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-mute hover:text-aegis-paper"
        >
          ← back to register
        </button>
      </PanelShell>
    );
  }

  return (
    <PanelShell
      eyebrow="step 04 · mint"
      title={
        <>
          Issue your App&rsquo;s <em>first</em> key.
        </>
      }
      copy="The API key authenticates your code to Nomos so it can ask the PDP to mint UCANs. The plaintext shows once — copy it on the next screen."
      footer={
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-mute hover:text-aegis-paper"
          >
            ← back
          </button>
          <button
            type="button"
            onClick={() => create.mutate({ agentId, name: keyName })}
            disabled={create.isPending || !keyName}
            className="group inline-flex items-center gap-2 rounded-sm bg-aegis-signal px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-ink transition-colors hover:bg-aegis-signal/90 disabled:opacity-50"
          >
            {create.isPending ? 'minting…' : 'mint key'}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      }
    >
      <div>
        <label
          htmlFor="key-name"
          className="block font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint"
        >
          Key name
        </label>
        <input
          id="key-name"
          value={keyName}
          onChange={(e) => setKeyName(e.target.value)}
          className="mt-2 block w-full rounded-sm border border-aegis-line bg-aegis-ink px-4 py-3 text-sm text-aegis-paper focus:border-aegis-signal focus:outline-none focus:ring-1 focus:ring-aegis-signal/40"
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

function CurlStep({
  apiKey,
  apiKeyName,
  onBack,
  onNext,
  onSkip,
}: {
  apiKey: string | null;
  apiKeyName: string | null;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const cpUrl = clientEnv.controlPlaneUrl;
  const pdpUrl = clientEnv.pdpUrl;
  // Two-step demo: mint a UCAN for /github/user/read from CP (uses API key),
  // then proxy through PDP (uses the UCAN). The PDP never sees the API key —
  // that separation is the whole point of Nomos, so the curl mirrors it.
  // `jq` is required to splice the minted JWT into the second call.
  const curl = apiKey
    ? `# 1. Trade your API key for a short-lived UCAN
UCAN=$(curl -sX POST ${cpUrl}/v1/mint-ucan \\
  -H "authorization: Bearer ${apiKey}" \\
  -H "content-type: application/json" \\
  -d '{"commands":["/github/user/read"]}' | jq -r '.ucans[0].jwt')

# 2. Use the UCAN to proxy a GitHub call through the PDP
curl -X POST ${pdpUrl}/v1/proxy/github/user/read \\
  -H "content-type: application/json" \\
  -d "{
    \\"ucan\\": \\"$UCAN\\",
    \\"request\\": { \\"command\\": \\"/github/user/read\\", \\"action\\": \\"read\\", \\"resource\\": {} },
    \\"apiCall\\": { \\"method\\": \\"GET\\", \\"path\\": \\"/user\\" }
  }"`
    : '';

  async function copy() {
    if (!apiKey) return;
    try {
      await navigator.clipboard.writeText(curl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked — fall through, user can select text manually
    }
  }

  return (
    <PanelShell
      eyebrow="step 05 · first call"
      title={
        <>
          Make your <em>first</em> proxied call.
        </>
      }
      copy="Two curls. First mints a short-lived UCAN from your API key. Second uses that UCAN to proxy a GitHub call through the PDP — Nomos evaluates the policy, attaches your encrypted GitHub token, and writes the decision to the audit chain. Requires jq for the JWT splice."
      footer={
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-mute hover:text-aegis-paper"
          >
            ← back
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onSkip}
              className="font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-mute hover:text-aegis-paper"
            >
              skip — view audit
            </button>
            <button
              type="button"
              onClick={onNext}
              className="group inline-flex items-center gap-2 rounded-sm bg-aegis-signal px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-ink transition-colors hover:bg-aegis-signal/90"
            >
              I ran it
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      }
    >
      {apiKey ? (
        <>
          <div className="rounded-sm border border-aegis-line bg-aegis-ink p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
                <Terminal className="h-3 w-3" />
                {apiKeyName ?? 'api-key'} · plaintext shown once
              </div>
              <button
                type="button"
                onClick={copy}
                className="inline-flex items-center gap-1.5 rounded-sm border border-aegis-line px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-aegis-paper hover:border-aegis-line-strong"
              >
                <Copy className="h-3 w-3" />
                {copied ? 'copied' : 'copy'}
              </button>
            </div>
            <pre className="mt-3 overflow-x-auto whitespace-pre text-[12px] leading-relaxed text-aegis-paper">
              {curl}
            </pre>
          </div>
          <p className="mt-4 max-w-[520px] text-xs leading-relaxed text-aegis-mute">
            We don&rsquo;t store the plaintext key. If you lose it, mint a new one from{' '}
            <code className="font-mono text-aegis-paper">/app/agents</code>.
          </p>
        </>
      ) : (
        <p className="text-sm text-aegis-mute">No API key in session — go back and mint one.</p>
      )}
    </PanelShell>
  );
}

function DoneStep({ onFinish }: { onFinish: () => void }) {
  return (
    <PanelShell
      eyebrow="step 06 · audit"
      title={
        <>
          You&rsquo;re <em>live</em>.
        </>
      }
      copy="Every authorize and proxy decision your App makes lands in the hash-chained audit log. Daily roots are signed Ed25519 — anyone holding the proof can verify offline with the audit-verify CLI."
      footer={
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={onFinish}
            className="group inline-flex items-center gap-2 rounded-sm bg-aegis-signal px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-aegis-ink transition-colors hover:bg-aegis-signal/90"
          >
            Open audit chain
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      }
    >
      <ul className="grid gap-3 text-sm text-aegis-mute sm:grid-cols-2">
        <li className="rounded-sm border border-aegis-line bg-aegis-ink px-4 py-3">
          <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
            next · register more apps
          </span>
          <Link
            href="/app/agents"
            className="mt-1 inline-flex items-center gap-1 text-aegis-paper hover:underline"
          >
            /app/agents <ArrowRight className="h-3 w-3" />
          </Link>
        </li>
        <li className="rounded-sm border border-aegis-line bg-aegis-ink px-4 py-3">
          <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
            edit policy · visual builder
          </span>
          <Link
            href="/app/policies"
            className="mt-1 inline-flex items-center gap-1 text-aegis-paper hover:underline"
          >
            /app/policies <ArrowRight className="h-3 w-3" />
          </Link>
        </li>
        <li className="rounded-sm border border-aegis-line bg-aegis-ink px-4 py-3">
          <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
            verify proofs · CLI
          </span>
          <code className="mt-1 block font-mono text-[12px] text-aegis-paper">
            npx @auto-nomos/audit-verify
          </code>
        </li>
        <li className="rounded-sm border border-aegis-line bg-aegis-ink px-4 py-3">
          <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-aegis-faint">
            settings · passkeys + Telegram
          </span>
          <Link
            href="/app/settings"
            className="mt-1 inline-flex items-center gap-1 text-aegis-paper hover:underline"
          >
            /app/settings <ArrowRight className="h-3 w-3" />
          </Link>
        </li>
      </ul>
    </PanelShell>
  );
}
