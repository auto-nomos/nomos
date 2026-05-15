'use client';

import { useEffect, useState } from 'react';
import { Button } from '../../../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../../components/ui/card';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { trpc } from '../../../../lib/trpc';

export default function OrganizationSettingsPage() {
  const me = trpc.auth.me.useQuery();
  const customer = trpc.customers.get.useQuery();
  const utils = trpc.useUtils();
  const update = trpc.customers.update.useMutation({
    onSuccess: () => {
      void utils.customers.get.invalidate();
      void utils.auth.me.invalidate();
    },
  });
  const [displayName, setDisplayName] = useState('');
  useEffect(() => {
    if (customer.data?.displayName) setDisplayName(customer.data.displayName);
  }, [customer.data?.displayName]);

  const canEdit = (() => {
    const p = me.data?.permissions;
    return Boolean(p?.org?.includes('update'));
  })();
  const isOwner = me.data?.activeRole === 'owner';

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Organization</h1>
        <p className="text-sm text-muted-foreground">
          How this org appears in the dashboard, API responses, and audit receipts. The DB-level
          handle (slug) stays stable for URLs and webhooks.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identity</CardTitle>
          <CardDescription>
            <span className="font-mono text-xs">slug: {customer.data?.slug ?? '…'}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!canEdit) return;
              update.mutate({ displayName });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="org-display-name">Display name</Label>
              <Input
                id="org-display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={!canEdit}
                placeholder="Acme Inc."
              />
            </div>
            {canEdit ? (
              <Button
                type="submit"
                disabled={update.isPending || displayName === customer.data?.displayName}
              >
                {update.isPending ? 'Saving…' : 'Save'}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Only owners or admins can change the organization name.
              </p>
            )}
            {update.error ? (
              <p className="text-sm text-destructive">{update.error.message}</p>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-mono text-sm">{customer.data?.plan ?? '…'}</p>
          <p className="mt-2 text-xs text-muted-foreground">Plan changes are handled in Billing.</p>
        </CardContent>
      </Card>

      {isOwner ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
            <CardDescription>
              Deleting an organization is irreversible and removes every agent, policy, grant, audit
              event, and API key bound to it. Reach out to support to schedule a delete — self-serve
              delete is intentionally not exposed yet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" disabled>
              Delete organization (coming soon)
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
