'use client';

import { Plug } from 'lucide-react';
import Link from 'next/link';
import { use } from 'react';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../../components/ui/table';
import { trpc } from '../../../../lib/trpc';
import { formatDate, shortId } from '../../../../lib/utils';
import { AgentTree } from './components/AgentTree';
import { AttachChildCard } from './components/AttachChildCard';
import { ChainApprovalCard } from './components/ChainApprovalCard';
import { ScopeContainment } from './components/ScopeContainment';

interface FlatAgent {
  id: string;
  name: string;
  depth: number;
}

function flattenTree(
  nodes: { id: string; name: string; depth: number; children: typeof nodes }[],
): FlatAgent[] {
  const out: FlatAgent[] = [];
  const walk = (ns: typeof nodes) => {
    for (const n of ns) {
      out.push({ id: n.id, name: n.name, depth: n.depth });
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

export default function SwarmDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const tree = trpc.swarms.tree.useQuery({ id });
  const receipts = trpc.swarms.recentReceipts.useQuery({ id, limit: 100 });
  const containment = trpc.swarms.scopeContainment.useQuery({ id });

  if (tree.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (tree.error) return <p className="text-sm text-destructive">{tree.error.message}</p>;
  const swarm = tree.data?.swarm;
  if (!swarm) return null;

  const swarmAgents = flattenTree(tree.data?.roots ?? []);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{swarm.name}</h1>
          <p className="text-sm text-muted-foreground">
            {tree.data?.totalAgents ?? 0} agents · max depth {swarm.maxDepth ?? 8}
          </p>
        </div>
        <Button asChild variant="default">
          <Link href={`/app/swarms/${id}/connect`} className="inline-flex items-center gap-1.5">
            <Plug className="h-4 w-4" />
            Connect agents
          </Link>
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agent tree</CardTitle>
          <CardDescription>
            Trust propagates root → leaf via UCAN delegation chain. Use{' '}
            <Link href={`/app/swarms/${id}/connect`} className="underline">
              Connect agents
            </Link>{' '}
            to wire a new child process; use the card below to record the tree shape after.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AgentTree roots={tree.data?.roots ?? []} />
        </CardContent>
      </Card>

      <AttachChildCard swarmId={id} swarmAgents={swarmAgents} />

      <ChainApprovalCard
        swarmId={id}
        rootAgents={(tree.data?.roots ?? []).map((r) => ({ id: r.id, name: r.name }))}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scope containment</CardTitle>
          <CardDescription>
            Each child's effective scope versus the root. Snapshot from each agent's most recent
            authorize receipt.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScopeContainment data={containment.data} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent receipts</CardTitle>
          <CardDescription>
            Last {receipts.data?.length ?? 0} authorize calls in this swarm.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!receipts.data || receipts.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No receipts yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Decision</TableHead>
                  <TableHead>Command</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Depth</TableHead>
                  <TableHead>Receipt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipts.data.map((r) => (
                  <TableRow key={r.eventId}>
                    <TableCell>{formatDate(r.ts)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          r.decision === 'allow'
                            ? 'default'
                            : r.decision === 'stepup'
                              ? 'secondary'
                              : 'destructive'
                        }
                      >
                        {r.decision}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.command}</TableCell>
                    <TableCell className="font-mono text-xs">{shortId(r.agent)}</TableCell>
                    <TableCell>{r.chainDepth ?? 0}</TableCell>
                    <TableCell className="font-mono text-xs">{shortId(r.eventId)}</TableCell>
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
