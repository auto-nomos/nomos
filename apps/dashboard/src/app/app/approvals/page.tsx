'use client';

import Link from 'next/link';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import { trpc } from '../../../lib/trpc';

export default function ApprovalsPage() {
  const pending = trpc.stepup.listPending.useQuery(undefined, {
    refetchInterval: 3000,
  });

  if (pending.isLoading) return <p className="text-sm text-zinc-500">Loading approvals…</p>;
  const rows = pending.data ?? [];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Pending approvals</h1>
        <p className="text-sm text-zinc-500">
          Step-up requests waiting for your decision. Auto-refreshes every 3s. Each request also
          fires a Telegram push if you've linked a chat.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Pending ({rows.length})</CardTitle>
          <CardDescription>
            Approvals expire automatically. Open one to register a passkey + approve / deny, or use
            the Telegram bot for one-tap decisions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No pending approvals. When an agent's call is denied by policy, a step-up request
              shows up here and a Telegram push (if linked) fires simultaneously.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Command</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.agentName ?? r.agentId}</TableCell>
                    <TableCell className="font-mono text-xs">{r.command}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {JSON.stringify(r.resource).slice(0, 80)}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">
                      {new Date(r.requestedAt).toLocaleTimeString()}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">
                      <Badge variant="outline">{new Date(r.expiresAt).toLocaleTimeString()}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm">
                        <Link href={`/approve/${r.id}`}>Review</Link>
                      </Button>
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
