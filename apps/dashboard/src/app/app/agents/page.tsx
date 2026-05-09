'use client';

import { Plus } from 'lucide-react';
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
import { formatDate, shortId } from '../../../lib/utils';

export default function AgentsPage() {
  const list = trpc.agents.list.useQuery();

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Apps</h1>
          <p className="text-sm text-muted-foreground">
            An App is a credential slot for one piece of code that calls our PDP — your AI agent,
            MCP server, script, or service. Each App has a stable DID + API key (revealed once).
          </p>
        </div>
        <Button asChild>
          <Link href="/app/agents/new">
            <Plus className="h-4 w-4" /> New App
          </Link>
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Apps</CardTitle>
          <CardDescription>{list.data ? `${list.data.length} total` : 'Loading…'}</CardDescription>
        </CardHeader>
        <CardContent>
          {list.isPending ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : list.data && list.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>DID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell className="font-mono text-xs">{shortId(a.did, 12, 6)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          a.status === 'active'
                            ? 'success'
                            : a.status === 'disabled'
                              ? 'warning'
                              : 'destructive'
                        }
                      >
                        {a.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(a.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/app/agents/${a.id}`}>Open</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <p className="text-sm text-muted-foreground">No Apps yet.</p>
              <Button asChild className="mt-4" size="sm">
                <Link href="/app/agents/new">Register your first App</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
