'use client';

import { GitBranch, Layers, Network, Plus, ShieldCheck, Workflow } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '../../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import { trpc } from '../../../lib/trpc';
import { formatDate } from '../../../lib/utils';

function ExplainerCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">What is a swarm?</CardTitle>
        <CardDescription>
          A swarm is a tree of Apps that delegate work to each other. The root mints a child UCAN;
          the child can mint a grandchild; the PDP enforces that scope only narrows downstream.
          Three things you get for free:
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <p className="font-medium">Trust propagates</p>
          <p className="text-xs text-muted-foreground">
            Root proves identity once. Every child carries the root's UCAN as a proof — no separate
            login per agent.
          </p>
        </div>
        <div className="space-y-1">
          <Layers className="h-5 w-5 text-primary" />
          <p className="font-medium">Scope narrows monotonically</p>
          <p className="text-xs text-muted-foreground">
            A child can only attenuate the parent's capability. Writer cannot get back what
            Researcher gave up. PDP rejects on attempt.
          </p>
        </div>
        <div className="space-y-1">
          <Workflow className="h-5 w-5 text-primary" />
          <p className="font-medium">Audit traces causation</p>
          <p className="text-xs text-muted-foreground">
            Every receipt links to its parent receipt. Walk any leaf back to the root call that
            triggered the chain.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function FirstSwarmRecipe() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">From zero to first swarm — five steps</CardTitle>
        <CardDescription>
          You'll need at least one App registered already. Two is better — one for the root, one for
          the first child.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3 text-sm">
          {[
            [
              '01',
              'Register two Apps',
              <>
                Go to{' '}
                <Link href="/app/agents" className="underline">
                  Apps
                </Link>{' '}
                and create two agents — e.g. <code className="font-mono text-xs">planner</code> and{' '}
                <code className="font-mono text-xs">researcher</code>. Issue an API key for each.
              </>,
            ],
            [
              '02',
              'Create the swarm',
              <>
                Use the form below. Pick the planner as the <strong>root</strong>. The swarm now
                exists with one agent at depth 0.
              </>,
            ],
            [
              '03',
              'Attach the child',
              <>
                Open the swarm. Use <em>Attach child agent</em> to hook the researcher under the
                planner. Both agents now share a swarm id.
              </>,
            ],
            [
              '04',
              'Wire the env vars',
              <>
                Open <em>Connect agents</em> on the swarm page. It shows you the exact{' '}
                <code className="font-mono text-xs">NOMOS_PARENT_UCAN_CHAIN</code> +{' '}
                <code className="font-mono text-xs">NOMOS_SWARM_ID</code> shape, with TS / Python /
                CLI snippets you can copy.
              </>,
            ],
            [
              '05',
              'Run a real call',
              <>
                Have the planner mint a child UCAN, fork the researcher process, and let the
                researcher hit GitHub through the PDP. Watch the tree light up with receipts on the
                swarm page; walk causation in{' '}
                <Link href="/app/audit" className="underline">
                  Audit
                </Link>
                .
              </>,
            ],
          ].map(([n, title, body]) => (
            <li key={n as string} className="grid grid-cols-[40px_minmax(0,1fr)] gap-3">
              <span className="font-mono text-base font-semibold text-primary">{n}</span>
              <div>
                <p className="font-medium">{title}</p>
                <p className="text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function CreateSwarmForm({
  agents,
  onCreated,
}: {
  agents: { id: string; name: string }[];
  onCreated?: () => void;
}) {
  const utils = trpc.useUtils();
  const create = trpc.swarms.create.useMutation({
    onSuccess: () => {
      utils.swarms.list.invalidate();
      setName('');
      setRootAgentId('');
      onCreated?.();
    },
  });
  const [name, setName] = useState('');
  const [rootAgentId, setRootAgentId] = useState('');
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Create swarm</CardTitle>
        <CardDescription>
          Pick a name + root agent. You can attach child agents from the swarm's detail page.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. research-team"
          className="max-w-xs"
        />
        <select
          value={rootAgentId}
          onChange={(e) => setRootAgentId(e.target.value)}
          className="rounded border px-2 text-sm"
        >
          <option value="">pick root agent…</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <Button
          onClick={() => create.mutate({ name, rootAgentId })}
          disabled={!name || !rootAgentId || create.isPending}
        >
          <Plus className="mr-1 h-4 w-4" />
          Create
        </Button>
        {agents.length === 0 && (
          <p className="w-full text-xs text-muted-foreground">
            No Apps yet —{' '}
            <Link href="/app/agents/new" className="underline">
              create one
            </Link>{' '}
            to use as the root.
          </p>
        )}
        {create.error && <p className="w-full text-xs text-destructive">{create.error.message}</p>}
      </CardContent>
    </Card>
  );
}

export default function SwarmsPage() {
  const list = trpc.swarms.list.useQuery();
  const agents = trpc.agents.list.useQuery();
  const isEmpty = !list.data || list.data.length === 0;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-sm border border-border bg-muted/30 px-2 py-1 text-xs text-muted-foreground">
            <GitBranch className="h-3 w-3" /> beta · multi-agent orchestration security
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Swarms</h1>
          <p className="text-sm text-muted-foreground">
            Group Apps into a delegation tree so a parent agent can fork constrained children.
            Trust, scope, and audit all flow root → leaf.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/app/guide/swarms" className="inline-flex items-center gap-1.5">
            Read the guide →
          </Link>
        </Button>
      </header>

      {isEmpty && <ExplainerCard />}
      {isEmpty && <FirstSwarmRecipe />}

      <CreateSwarmForm agents={(agents.data ?? []).map((a) => ({ id: a.id, name: a.name }))} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All swarms</CardTitle>
        </CardHeader>
        <CardContent>
          {isEmpty ? (
            <p className="text-sm text-muted-foreground">
              No swarms yet. Create one above to get started.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-32">Max depth</TableHead>
                  <TableHead className="w-40" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data?.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      <span className="inline-flex items-center gap-1">
                        <Network className="h-4 w-4" />
                        {s.name}
                      </span>
                    </TableCell>
                    <TableCell>{formatDate(s.createdAt)}</TableCell>
                    <TableCell>{s.maxDepth ?? 8}</TableCell>
                    <TableCell className="space-x-3">
                      <Link className="text-sm text-primary underline" href={`/app/swarms/${s.id}`}>
                        Open
                      </Link>
                      <Link
                        className="text-sm text-primary underline"
                        href={`/app/swarms/${s.id}/connect`}
                      >
                        Connect
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
