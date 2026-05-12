'use client';

import { use, useState } from 'react';
import { Badge } from '../../../../../components/ui/badge';
import { Button } from '../../../../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../../../components/ui/card';
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

export default function AgentGrantsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: agentId } = use(params);
  const utils = trpc.useUtils();
  const grants = trpc.grants.list.useQuery({ agentId });
  const toggle = trpc.grants.toggle.useMutation({
    onSuccess: () => utils.grants.list.invalidate({ agentId }),
  });
  const revoke = trpc.grants.revoke.useMutation({
    onSuccess: () => utils.grants.list.invalidate({ agentId }),
  });
  const [expanded, setExpanded] = useState<string | null>(null);

  if (grants.isLoading) return <p className="text-sm text-zinc-500">Loading grants…</p>;
  const rows = grants.data ?? [];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Granted permissions</h1>
        <p className="text-sm text-zinc-500">
          Decisions you made on step-up prompts. Toggle allow↔deny, or revoke to force the next call
          to ask again.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Active grants ({rows.length})</CardTitle>
          <CardDescription>
            Grants are appended to this agent's Cedar policy bundle on every fetch.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No grants yet. Step-up approvals saved with “Remember” will appear here.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Decision</TableHead>
                  <TableHead>Command</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Granted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((g) => (
                  <>
                    <TableRow key={g.id}>
                      <TableCell>
                        <Badge variant={g.decision === 'allow' ? 'default' : 'destructive'}>
                          {g.decision}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{g.command}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {g.scope === 'any' ? (
                          <span className="text-zinc-400">any</span>
                        ) : (
                          JSON.stringify(g.resourcePattern).slice(0, 80)
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{g.scope}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-zinc-500">
                        {formatDate(g.grantedAt)}
                      </TableCell>
                      <TableCell className="space-x-2 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setExpanded(expanded === g.id ? null : g.id)}
                        >
                          {expanded === g.id ? 'Hide' : 'Cedar'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggle.mutate({ grantId: g.id })}
                          disabled={toggle.isPending}
                        >
                          Toggle
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => revoke.mutate({ grantId: g.id })}
                          disabled={revoke.isPending}
                        >
                          Revoke
                        </Button>
                      </TableCell>
                    </TableRow>
                    {expanded === g.id && g.cedarSnippet && (
                      <TableRow key={`${g.id}-cedar`}>
                        <TableCell colSpan={6} className="bg-zinc-50">
                          <pre className="whitespace-pre-wrap text-xs">{g.cedarSnippet}</pre>
                          {g.riskSummary && (
                            <p className="mt-2 text-xs text-zinc-500">Risk: {g.riskSummary}</p>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
