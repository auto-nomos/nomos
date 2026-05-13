'use client';

import { use } from 'react';
import { Badge } from '../../../../components/ui/badge';
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
import { ChainApprovalCard } from './components/ChainApprovalCard';
import { ScopeContainment } from './components/ScopeContainment';

export default function SwarmDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const tree = trpc.swarms.tree.useQuery({ id });
  const receipts = trpc.swarms.recentReceipts.useQuery({ id, limit: 100 });
  const containment = trpc.swarms.scopeContainment.useQuery({ id });

  if (tree.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (tree.error) return <p className="text-sm text-destructive">{tree.error.message}</p>;
  const swarm = tree.data?.swarm;
  if (!swarm) return null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{swarm.name}</h1>
        <p className="text-sm text-muted-foreground">
          {tree.data?.totalAgents ?? 0} agents · max depth {swarm.maxDepth ?? 8}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agent tree</CardTitle>
          <CardDescription>Trust propagates root → leaf via UCAN delegation chain.</CardDescription>
        </CardHeader>
        <CardContent>
          <AgentTree roots={tree.data?.roots ?? []} />
        </CardContent>
      </Card>

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
