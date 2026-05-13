'use client';

import { Badge } from '../../../../../components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../../../components/ui/table';
import { formatDate } from '../../../../../lib/utils';

interface AgentSummary {
  agentId: string;
  name: string;
  depth: number;
  lastDecision: string | null;
  lastChainDepth: number | null;
  lastCommand: string | null;
  lastTs: Date | string | null;
}

interface ContainmentData {
  agents: AgentSummary[];
  totalAgents?: number;
}

export function ScopeContainment({ data }: { data: ContainmentData | undefined }) {
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!data.agents.length) {
    return <p className="text-sm text-muted-foreground">No agents in this swarm.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Agent</TableHead>
          <TableHead>Depth</TableHead>
          <TableHead>Last decision</TableHead>
          <TableHead>Last command</TableHead>
          <TableHead>Last call at</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.agents.map((a) => (
          <TableRow key={a.agentId}>
            <TableCell className="font-medium">{a.name}</TableCell>
            <TableCell>{a.depth}</TableCell>
            <TableCell>
              {a.lastDecision ? (
                <Badge
                  variant={
                    a.lastDecision === 'allow'
                      ? 'default'
                      : a.lastDecision === 'stepup'
                        ? 'secondary'
                        : 'destructive'
                  }
                >
                  {a.lastDecision}
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground">no calls yet</span>
              )}
            </TableCell>
            <TableCell className="font-mono text-xs">{a.lastCommand ?? '—'}</TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {a.lastTs ? formatDate(a.lastTs) : '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
