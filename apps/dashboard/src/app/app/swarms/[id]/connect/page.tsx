'use client';

import { ArrowLeft, Check, Copy, Network } from 'lucide-react';
import Link from 'next/link';
import { use, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../../../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../../../components/ui/tabs';
import { trpc } from '../../../../../lib/trpc';

const CONTROL_PLANE_URL =
  process.env.NEXT_PUBLIC_CONTROL_PLANE_PUBLIC_URL ??
  process.env.NEXT_PUBLIC_CONTROL_PLANE_URL ??
  'https://api.auto-nomos.com';
const PDP_URL = process.env.NEXT_PUBLIC_PDP_URL ?? 'https://pdp.auto-nomos.com';

function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-md border border-border bg-muted/30 p-4 font-mono text-xs leading-relaxed text-foreground">
        {children}
      </pre>
      <button
        type="button"
        onClick={copy}
        className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-sm border border-border bg-background px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Copy"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? 'copied' : 'copy'}
      </button>
    </div>
  );
}

export default function ConnectSwarmPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: swarmId } = use(params);
  const tree = trpc.swarms.tree.useQuery({ id: swarmId });
  const swarm = tree.data?.swarm;
  const root = tree.data?.roots?.[0];
  const cp = CONTROL_PLANE_URL;
  const pdp = PDP_URL;

  if (tree.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!swarm) return <p className="text-sm text-destructive">Swarm not found.</p>;

  const rootName = root?.name ?? '<root-app>';
  const rootDid = root?.did ?? '<root-did>';

  const tsSpawn = `// Parent (root) agent — runs first, mints + spawns the child.
import { spawn } from 'node:child_process';
import { forkChild, readParentChainFromEnv } from '@auto-nomos/sdk';
import { mintUcan } from '@auto-nomos/ucan';

// 1. Build the parent's own chain (here it's just the root UCAN).
const parentChain = readParentChainFromEnv(process.env) ?? {
  chain: [process.env.NOMOS_ROOT_UCAN!],
};

// 2. Mint a *narrower* UCAN for the child, citing the parent as proof.
const childUcan = await mintUcan({
  audience: '<child-app-did>',
  capability: [{ with: 'github://acme/repo', can: 'repo:read' }],
  prf: [parentChain.chain.at(-1)!],   // parent leaf as proof
});

// 3. forkChild() concatenates parent chain + child UCAN.
const childChain = forkChild({
  parentChain: parentChain.chain,
  childUcanJwt: childUcan.jwt,
  swarmId: '${swarmId}',
});

// 4. Spawn the child process with the chain in env.
spawn('node', ['./researcher.js'], {
  env: {
    ...process.env,
    NOMOS_PARENT_UCAN_CHAIN: JSON.stringify(childChain.chain),
    NOMOS_SWARM_ID: '${swarmId}',
    NOMOS_API_KEY: process.env.NOMOS_CHILD_API_KEY!,
  },
  stdio: 'inherit',
});`;

  const pySpawn = `# Parent agent (Python) — same shape as the TS version.
import json, os, subprocess
from nomos import fork_child, read_parent_chain_from_env
from nomos.ucan_cli import mint  # shells out to nomos-ucan binary

parent = read_parent_chain_from_env(os.environ) or {
    "chain": [os.environ["NOMOS_ROOT_UCAN"]]
}

child_ucan = mint(
    audience="<child-app-did>",
    capability=[{"with": "github://acme/repo", "can": "repo:read"}],
    prf=[parent["chain"][-1]],
)

child = fork_child(
    parent_chain=parent["chain"],
    child_ucan_jwt=child_ucan["jwt"],
    swarm_id="${swarmId}",
)

subprocess.Popen(
    ["python", "./researcher.py"],
    env={
        **os.environ,
        "NOMOS_PARENT_UCAN_CHAIN": json.dumps(child["chain"]),
        "NOMOS_SWARM_ID": "${swarmId}",
        "NOMOS_API_KEY": os.environ["NOMOS_CHILD_API_KEY"],
    },
)`;

  const cliSpawn = `# Pure shell — useful for orchestrators that don't import the SDK
# (LangGraph + CrewAI + AutoGen + Claude sub-agent shells).

# 1. Mint a child UCAN with the parent leaf as proof.
CHILD_JWT=$(nomos-ucan mint \\
  --issuer  "${rootDid}" \\
  --audience "<child-did>" \\
  --capability '[{"with":"github://acme/repo","can":"repo:read"}]' \\
  --prf "$NOMOS_ROOT_UCAN" \\
  | jq -r .jwt)

# 2. forkChild equivalent: append child JWT to parent chain.
CHAIN=$(nomos-ucan fork \\
  --parent-chain "$NOMOS_ROOT_UCAN" \\
  --child-jwt "$CHILD_JWT")

# 3. Hand to the child process via env.
NOMOS_PARENT_UCAN_CHAIN="$CHAIN" \\
NOMOS_SWARM_ID="${swarmId}" \\
NOMOS_API_KEY="$CHILD_API_KEY" \\
  python ./researcher.py`;

  const childRuntime = `// Inside the child process — usual SDK call. The chain is
// auto-detected from NOMOS_PARENT_UCAN_CHAIN; you don't have to think about it.
import { createIntentClient } from '@auto-nomos/sdk';

const client = createIntentClient({
  controlPlaneUrl: '${cp}',
  apiKey: process.env.NOMOS_API_KEY!,
});

const grant = await client.acquire({
  constraint: { provider: 'github', owner: 'acme', repo: 'repo' },
  actions: ['/github/issue/list'],
  ttlSeconds: 600,
  purpose: 'triage backlog as the researcher sub-agent',
});

// PDP receives delegated_chain with parent + child JWTs and validates
// attenuation + depth before allowing.`;

  const envOverview = `# Wire format — the three env vars every orchestrator agrees on.
NOMOS_PARENT_UCAN_CHAIN='[<rootJWT>, <midJWT>]'   # JSON, root-first
NOMOS_PARENT_RECEIPT_ID='evt_…'                   # parent's last allow receipt
NOMOS_SWARM_ID='${swarmId}'                        # this swarm
NOMOS_MAX_CHAIN_DEPTH=8                            # default; PDP enforces`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href={`/app/swarms/${swarmId}`}
          className="inline-flex items-center gap-1 hover:underline"
        >
          <ArrowLeft className="h-3 w-3" /> {swarm.name}
        </Link>
      </div>
      <header className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-sm border border-border bg-muted/30 px-2 py-1 text-xs text-muted-foreground">
          <Network className="h-3 w-3" /> swarm · {swarmId.slice(0, 8)}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Connect agents to this swarm</h1>
        <p className="text-sm text-muted-foreground">
          Two parts: (1) the <strong>root agent</strong> mints a narrower UCAN for each child it
          spawns, and (2) the child process inherits the chain via three env vars. After that the
          existing SDK call works as before — the chain travels along automatically.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Step 1 · Confirm a root agent exists</CardTitle>
          <CardDescription>
            Every swarm needs a root App. This swarm's root is <strong>{rootName}</strong>. If you
            haven't created it yet, do that first.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          <Link href={`/app/agents/${root?.id}`} className="text-sm text-primary underline">
            Open root App →
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Step 2 · Wire the child env vars</CardTitle>
          <CardDescription>
            Same three variables for every orchestrator (LangGraph, CrewAI, AutoGen, Claude
            sub-agents).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CodeBlock>{envOverview}</CodeBlock>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Step 3 · Fork a child agent</CardTitle>
          <CardDescription>
            Pick the runtime that matches your stack. All three produce the same on-the-wire chain.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="ts">
            <TabsList>
              <TabsTrigger value="ts">TypeScript</TabsTrigger>
              <TabsTrigger value="py">Python</TabsTrigger>
              <TabsTrigger value="cli">Shell / CLI</TabsTrigger>
            </TabsList>
            <TabsContent value="ts">
              <CodeBlock>{tsSpawn}</CodeBlock>
            </TabsContent>
            <TabsContent value="py">
              <CodeBlock>{pySpawn}</CodeBlock>
            </TabsContent>
            <TabsContent value="cli">
              <CodeBlock>{cliSpawn}</CodeBlock>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Step 4 · The child calls Nomos as usual</CardTitle>
          <CardDescription>
            Nothing special inside the child — the chain is auto-injected from env into every
            authorize request.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CodeBlock>{childRuntime}</CodeBlock>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Step 5 · Watch decisions land</CardTitle>
          <CardDescription>
            Open the swarm view to see the agent tree, recent receipts colored by decision, and the
            scope-containment widget that shows where each child's effective scope sits relative to
            the root.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          <Link href={`/app/swarms/${swarmId}`} className="text-sm text-primary underline">
            Back to swarm view →
          </Link>{' '}
          ·{' '}
          <Link href="/app/audit" className="text-sm text-primary underline">
            Audit chain →
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reference integrations</CardTitle>
          <CardDescription>Working examples in the repo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            <code className="font-mono text-xs">examples/langgraph-nomos/</code> · 3-agent Python
            chain (planner → researcher → writer) hitting GitHub through PDP.
          </p>
          <p>
            <code className="font-mono text-xs">examples/crewai-nomos/</code> · CrewAI Task wrapper
            forwarding the chain via Crew context.
          </p>
          <p>
            <code className="font-mono text-xs">examples/claude-subagents-nomos/</code> · Claude
            Code Task tool spawning sub-agents under one root identity.
          </p>
          <p className="pt-2 text-muted-foreground">
            Endpoints used: <code className="font-mono text-xs">{cp}</code> ·{' '}
            <code className="font-mono text-xs">{pdp}</code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
