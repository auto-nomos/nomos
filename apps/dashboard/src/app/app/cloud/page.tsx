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

const CONNECTOR_LABEL: Record<string, string> = {
  azure: 'Azure',
  aws: 'AWS',
  gcp: 'GCP',
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  verified: 'default',
  pending: 'secondary',
  broken: 'destructive',
};

export default function CloudAccountsPage() {
  const utils = trpc.useUtils();
  const list = trpc.cloudConnections.list.useQuery();
  const disconnect = trpc.cloudConnections.disconnect.useMutation({
    onSuccess: () => utils.cloudConnections.list.invalidate(),
  });
  const verifyNow = trpc.cloudConnections.verifyNow.useMutation({
    onSuccess: () => utils.cloudConnections.list.invalidate(),
  });

  const rows = list.data ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Cloud accounts</h1>
        <p className="text-sm text-muted-foreground">
          Federated cloud IAM. Nomos hosts an OIDC issuer at{' '}
          <code className="font-mono">id.auto-nomos.com</code>; your AWS / Azure / GCP trusts it and
          Nomos mints short-lived credentials per agent request. No long-lived secrets stored.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Active</CardTitle>
          <CardDescription>
            {rows.length} cloud account{rows.length === 1 ? '' : 's'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No cloud accounts connected. Start with the Azure connect wizard below.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cloud</TableHead>
                  <TableHead>Account / subscription</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last verified</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium">
                        {CONNECTOR_LABEL[row.connector] ?? row.connector}
                      </div>
                      {row.displayName ? (
                        <div className="text-xs text-muted-foreground">{row.displayName}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <code className="font-mono text-xs">{row.accountId}</code>
                      {row.tenantId ? (
                        <div className="text-xs text-muted-foreground">tenant: {row.tenantId}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[row.bootstrapStatus] ?? 'outline'}>
                        {row.bootstrapStatus}
                      </Badge>
                      {row.lastVerifyError ? (
                        <div className="mt-1 text-xs text-destructive">{row.lastVerifyError}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.lastVerifiedAt ? new Date(row.lastVerifiedAt).toLocaleString() : 'never'}
                    </TableCell>
                    <TableCell className="space-x-1 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={
                          verifyNow.isPending && verifyNow.variables?.connectionId === row.id
                        }
                        onClick={() => verifyNow.mutate({ connectionId: row.id })}
                      >
                        {verifyNow.isPending && verifyNow.variables?.connectionId === row.id
                          ? 'Verifying…'
                          : 'Verify now'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={disconnect.isPending}
                        onClick={() => disconnect.mutate({ connectionId: row.id })}
                      >
                        Disconnect
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connect a new cloud</CardTitle>
          <CardDescription>One Terraform module per cloud. Open-source, MIT.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Link
            href="/app/cloud/connect/azure"
            className="rounded-md border border-border bg-card p-4 transition hover:border-primary"
          >
            <div className="font-medium">Azure</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Federated credential on App Registration. Reader role at sub or RG scope.
            </div>
            <div className="mt-3 text-xs">M1 — available now</div>
          </Link>
          <Link
            href="/app/cloud/connect/aws"
            className="rounded-md border border-border bg-card p-4 transition hover:border-primary"
          >
            <div className="font-medium">AWS</div>
            <div className="mt-1 text-xs text-muted-foreground">
              IAM role with OIDC trust + AssumeRoleWithWebIdentity. SigV4 signing.
            </div>
            <div className="mt-3 text-xs">M5 — available now</div>
          </Link>
          <Link
            href="/app/cloud/connect/gcp"
            className="rounded-md border border-border bg-card p-4 transition hover:border-primary"
          >
            <div className="font-medium">GCP</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Workload Identity Federation pool + provider + SA impersonation.
            </div>
            <div className="mt-3 text-xs">M7 — available now</div>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
