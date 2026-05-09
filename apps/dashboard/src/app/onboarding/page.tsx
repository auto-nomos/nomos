'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { useSession } from '../../lib/auth-client';
import { type ConnectorId, startOAuthConnect } from '../../lib/oauth';
import { trpc } from '../../lib/trpc';

const CONNECTORS: { id: ConnectorId; label: string; blurb: string }[] = [
  { id: 'github', label: 'GitHub', blurb: 'issues, PRs, repo metadata' },
  { id: 'slack', label: 'Slack', blurb: 'send messages, read channels' },
  { id: 'google', label: 'Google', blurb: 'Drive, Calendar' },
  { id: 'notion', label: 'Notion', blurb: 'pages, databases' },
];

const STARTER_POLICY = `permit (
  principal,
  action == Action::"github_create_issue",
  resource
);`;

export default function OnboardingPage() {
  const router = useRouter();
  const session = useSession();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  useEffect(() => {
    if (!session.isPending && !session.data) router.replace('/sign-in');
  }, [session.isPending, session.data, router]);

  if (session.isPending || !session.data) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </main>
    );
  }

  return (
    <main className="container max-w-2xl py-12">
      <header className="mb-8 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome aboard</h1>
        <p className="text-sm text-muted-foreground">Three quick steps to a working agent.</p>
        <Stepper step={step} />
      </header>

      {step === 1 ? <ConnectStep onNext={() => setStep(2)} /> : null}
      {step === 2 ? <AgentStep onNext={() => setStep(3)} /> : null}
      {step === 3 ? <PolicyStep onDone={() => router.push('/app')} /> : null}
    </main>
  );
}

function Stepper({ step }: { step: number }) {
  const labels = ['Connect SaaS', 'Create agent', 'Author policy'];
  return (
    <ol className="mt-4 flex gap-2 text-xs">
      {labels.map((l, i) => {
        const idx = i + 1;
        const active = idx === step;
        const done = idx < step;
        return (
          <li
            key={l}
            className={
              active
                ? 'rounded-full bg-foreground px-3 py-1 text-background'
                : done
                  ? 'rounded-full border border-foreground px-3 py-1'
                  : 'rounded-full border border-muted-foreground/30 px-3 py-1 text-muted-foreground'
            }
          >
            {idx}. {l}
          </li>
        );
      })}
    </ol>
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
    <Card>
      <CardHeader>
        <CardTitle>Connect your first SaaS</CardTitle>
        <CardDescription>
          The agent never holds tokens. The control plane stores them encrypted; the PDP borrows
          them per call.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {CONNECTORS.map((c) => {
          const connected = connectedSet.has(c.id);
          return (
            <div key={c.id} className="flex flex-col gap-2 rounded-lg border p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium capitalize">{c.label}</p>
                  <p className="text-xs text-muted-foreground">{c.blurb}</p>
                </div>
                {connected ? (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-600">
                    Connected
                  </span>
                ) : null}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => connect(c.id)}
                disabled={pending !== null || connected}
              >
                {pending === c.id ? 'Redirecting…' : connected ? 'Connected' : 'Connect'}
              </Button>
            </div>
          );
        })}
        {error ? (
          <p className="col-span-full text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="justify-between">
        <p className="text-xs text-muted-foreground">
          Skip if you don&apos;t have an OAuth app yet — you can connect later.
        </p>
        <Button variant="ghost" onClick={onNext}>
          Skip for now
        </Button>
      </CardFooter>
    </Card>
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
    <Card>
      <CardHeader>
        <CardTitle>Create your first agent</CardTitle>
        <CardDescription>
          Each agent has a stable DID and an API key (revealed once on the agent detail page).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Label htmlFor="agent-name">Agent name</Label>
        <Input
          id="agent-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="release-bot"
        />
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </CardContent>
      <CardFooter>
        <Button onClick={() => create.mutate({ name })} disabled={create.isPending || !name}>
          {create.isPending ? 'Creating…' : 'Create agent'}
        </Button>
      </CardFooter>
    </Card>
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
    <Card>
      <CardHeader>
        <CardTitle>Author a starter policy</CardTitle>
        <CardDescription>
          Cedar policy enforced at the PDP. Tweak later in the policy editor.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="policy-name">Policy name</Label>
          <Input id="policy-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cedar">Cedar text</Label>
          <Textarea
            id="cedar"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            className="font-mono text-xs"
          />
        </div>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="ghost" onClick={onDone}>
          Skip and finish
        </Button>
        <Button
          onClick={() => upsert.mutate({ name, cedarText: text })}
          disabled={upsert.isPending || !name || !text}
        >
          {upsert.isPending ? 'Saving…' : 'Finish'}
        </Button>
      </CardFooter>
    </Card>
  );
}
