'use client';

import { useState } from 'react';
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
import { type ConnectorId, OAUTH_FLOW_CONNECTORS, startOAuthConnect } from '../../../lib/oauth';
import { trpc } from '../../../lib/trpc';
import { usePermissions } from '../../../lib/use-permissions';
import { ManualTokenForm } from './manual-token';

const CONNECTOR_LABELS: Record<string, string> = {
  github: 'GitHub',
  slack: 'Slack',
  google: 'Google',
  notion: 'Notion',
};

export default function ConnectionsPage() {
  const { can } = usePermissions();
  const canCreate = can('oauth', 'create');
  const canUpdate = can('oauth', 'update');
  const canDelete = can('oauth', 'delete');
  const utils = trpc.useUtils();
  const list = trpc.oauth.list.useQuery();
  const disconnect = trpc.oauth.disconnect.useMutation({
    onSuccess: () => utils.oauth.list.invalidate(),
  });
  const refresh = trpc.oauth.refresh.useMutation({
    onSuccess: () => utils.oauth.list.invalidate(),
  });
  const [pendingConnect, setPendingConnect] = useState<ConnectorId | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reconnect(id: ConnectorId) {
    setError(null);
    setPendingConnect(id);
    try {
      const res = await startOAuthConnect(id);
      window.location.href = res.authUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'reconnect failed');
      setPendingConnect(null);
    }
  }

  const rows = list.data ?? [];
  const connectedIds = new Set(rows.map((r) => r.connector));
  const unconnected = OAUTH_FLOW_CONNECTORS.filter(
    (c) => !connectedIds.has(c as ConnectorId),
  ) as ConnectorId[];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Connections</h1>
        <p className="text-sm text-muted-foreground">
          OAuth grants the PDP borrows access tokens from. Disconnect drops the row immediately;
          outstanding UCANs still expire on their own TTL.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Active</CardTitle>
          <CardDescription>
            {rows.length} connector{rows.length === 1 ? '' : 's'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No connections yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Connector</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead>Access expires</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const expiresAt = r.accessTokenExpiresAt
                    ? new Date(r.accessTokenExpiresAt)
                    : null;
                  const expired = expiresAt ? expiresAt.getTime() < Date.now() : false;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {CONNECTOR_LABELS[r.connector] ?? r.connector}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.accountId}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.scopesGranted?.length ? r.scopesGranted.join(', ') : '—'}
                      </TableCell>
                      <TableCell>
                        {expiresAt ? (
                          <Badge variant={expired ? 'destructive' : 'secondary'}>
                            {expiresAt.toLocaleString()}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">never</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(r.updatedAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        {r.hasRefreshToken ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!canUpdate || refresh.isPending}
                            title={canUpdate ? undefined : 'Need admin or agent_manager role'}
                            onClick={() => refresh.mutate({ connectionId: r.id })}
                          >
                            {refresh.isPending && refresh.variables?.connectionId === r.id
                              ? 'Refreshing…'
                              : 'Refresh'}
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!canCreate || pendingConnect !== null}
                          title={canCreate ? undefined : 'Need admin or agent_manager role'}
                          onClick={() => reconnect(r.connector as ConnectorId)}
                        >
                          {pendingConnect === r.connector ? 'Redirecting…' : 'Reconnect'}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={!canDelete || disconnect.isPending}
                          title={canDelete ? undefined : 'Need admin role'}
                          onClick={() => {
                            if (
                              confirm(`Disconnect ${CONNECTOR_LABELS[r.connector] ?? r.connector}?`)
                            ) {
                              disconnect.mutate({ connectionId: r.id });
                            }
                          }}
                        >
                          {disconnect.isPending && disconnect.variables?.connectionId === r.id
                            ? 'Removing…'
                            : 'Disconnect'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {refresh.error ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              Refresh failed: {refresh.error.message}
            </p>
          ) : null}
          {disconnect.error ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              Disconnect failed: {disconnect.error.message}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {unconnected.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Available</CardTitle>
            <CardDescription>
              {canCreate
                ? 'Add a new SaaS connection.'
                : "Read-only — your role can't add new connections."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {unconnected.map((id) => (
              <Button
                key={id}
                size="sm"
                variant="outline"
                disabled={!canCreate || pendingConnect !== null}
                title={canCreate ? undefined : 'Need admin or agent_manager role'}
                onClick={() => reconnect(id)}
              >
                {pendingConnect === id ? 'Redirecting…' : `Connect ${CONNECTOR_LABELS[id] ?? id}`}
              </Button>
            ))}
            {error ? (
              <p className="w-full text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <ManualTokenForm />
    </div>
  );
}
