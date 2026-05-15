'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
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
import { usePermissions } from '../../../lib/use-permissions';
import { formatDate } from '../../../lib/utils';

export default function PoliciesPage() {
  const { can } = usePermissions();
  const canCreate = can('policies', 'create');
  const list = trpc.policies.list.useQuery();
  const grouped = groupByIntegration(list.data ?? []);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Policies</h1>
          <p className="text-sm text-muted-foreground">
            Cedar policies. The PDP enforces these on every authorize call.
          </p>
        </div>
        {canCreate ? (
          <Button asChild>
            <Link href="/app/policies/new">
              <Plus className="h-4 w-4" /> New policy
            </Link>
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">
            Read-only — need policy_author/admin
          </span>
        )}
      </header>

      {list.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : list.data && list.data.length > 0 ? (
        Object.entries(grouped).map(([integration, items]) => (
          <Card key={integration}>
            <CardHeader>
              <CardTitle className="text-base capitalize">{integration}</CardTitle>
              <CardDescription>{items.length} policies</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(p.updatedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/app/policies/${p.id}`}>Edit</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      ) : (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">No policies yet.</p>
          {canCreate ? (
            <Button asChild className="mt-4" size="sm">
              <Link href="/app/policies/new">
                <Plus className="h-4 w-4" /> Create your first policy
              </Link>
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

interface PolicyRow {
  id: string;
  name: string;
  integrationId: string | null;
  updatedAt: string | Date;
}

function groupByIntegration(rows: PolicyRow[]): Record<string, PolicyRow[]> {
  const out: Record<string, PolicyRow[]> = {};
  for (const r of rows) {
    const key = r.integrationId ?? 'general';
    if (!out[key]) out[key] = [];
    out[key].push(r);
  }
  return out;
}
