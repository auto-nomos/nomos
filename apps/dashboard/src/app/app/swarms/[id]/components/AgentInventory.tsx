'use client';

import { useState } from 'react';
import { Badge } from '../../../../../components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../../../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../../../../components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../../../components/ui/table';
import { trpc } from '../../../../../lib/trpc';
import { formatDate } from '../../../../../lib/utils';
import { CapVsActDiff } from './CapVsActDiff';

export function AgentInventory({ swarmId }: { swarmId?: string }) {
  const q = trpc.observability.agentInventory.useQuery(
    swarmId ? { swarmId, windowDays: 7 } : { windowDays: 7 },
    { refetchInterval: 15_000 },
  );
  const [openAgent, setOpenAgent] = useState<{ id: string; name: string } | null>(null);
  const rows = q.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Agent inventory (7d)</CardTitle>
        <CardDescription>
          Per-agent volume, decision split, distinct commands + resources, max chain depth. Click a
          row for the &quot;CAN do vs DOES do&quot; diff.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No agents yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Allow</TableHead>
                <TableHead className="text-right">Deny</TableHead>
                <TableHead className="text-right">Step-up</TableHead>
                <TableHead className="text-right">Deny rate</TableHead>
                <TableHead className="text-right">Cmds</TableHead>
                <TableHead className="text-right">Resources</TableHead>
                <TableHead className="text-right">Max depth</TableHead>
                <TableHead className="text-right">Last seen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.agentId}
                  className="cursor-pointer"
                  onClick={() => setOpenAgent({ id: r.agentId, name: r.agentName })}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span>{r.agentName}</span>
                      {r.depth > 0 ? (
                        <Badge variant="outline" className="text-xs">
                          d{r.depth}
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.total}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.allow}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.deny}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.stepup}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {(r.denyRate * 100).toFixed(0)}%
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.distinctCommands}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.distinctResources}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.maxChainDepth ?? '—'}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {r.lastTs ? formatDate(r.lastTs) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={openAgent !== null} onOpenChange={(o) => !o && setOpenAgent(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{openAgent?.name}</DialogTitle>
            <DialogDescription>
              Capability vs activity diff. Mapped Cedar policies define the &quot;can&quot; set;
              7-day audit defines the &quot;does&quot; set.
            </DialogDescription>
          </DialogHeader>
          {openAgent ? <CapVsActDiff agentId={openAgent.id} /> : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
