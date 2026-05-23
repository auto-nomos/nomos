'use client';

import { Check, Copy } from 'lucide-react';
import Link from 'next/link';
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

function CopyField({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code
          className={`flex-1 select-all rounded border border-aegis-line bg-aegis-well px-3 py-2 text-sm ${mono ? 'font-mono' : ''} text-aegis-paper`}
        >
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded border border-aegis-line p-2 text-aegis-mute transition-colors hover:border-aegis-line-strong hover:text-aegis-paper"
          title="Copy to clipboard"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}

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
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Organization</h1>
            <p className="text-sm text-muted-foreground">
              How this org appears in the dashboard, API responses, and audit receipts. The DB-level
              handle (slug) stays stable for URLs and webhooks.
            </p>
          </div>
          <Link
            href="/app/guide/organizations"
            className="shrink-0 rounded-sm border border-aegis-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-aegis-mute transition-colors hover:border-aegis-line-strong hover:text-aegis-paper"
          >
            Read guide →
          </Link>
        </div>
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
          <CardTitle className="text-base">Identifiers</CardTitle>
          <CardDescription>Paste these into Terraform modules and SDK config.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {customer.data ? (
            <>
              <CopyField label="Organization ID (customer_id)" value={customer.data.id} />
              <CopyField label="Slug" value={customer.data.slug ?? customer.data.name ?? ''} />
              {customer.data.displayName ? (
                <CopyField label="Display name" value={customer.data.displayName} mono={false} />
              ) : null}
            </>
          ) : (
            <p className="font-mono text-xs text-aegis-mute">loading…</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Where to use these</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="flex gap-3">
            <span className="mt-0.5 shrink-0 font-mono text-xs text-aegis-mute">TF</span>
            <p>
              Set <code className="font-mono text-xs">customer_id</code> in the{' '}
              <code className="font-mono text-xs">nomos_azure</code> module — this scopes the
              federated identity credential to your org.
            </p>
          </div>
          <div className="flex gap-3">
            <span className="mt-0.5 shrink-0 font-mono text-xs text-aegis-mute">SDK</span>
            <p>
              Passed automatically via the API key — you don&apos;t need to supply it manually
              unless you&apos;re constructing raw UCAN tokens.
            </p>
          </div>
          <div className="flex gap-3">
            <span className="mt-0.5 shrink-0 font-mono text-xs text-aegis-mute">OIDC</span>
            <p>
              Nomos embeds this ID in the federated token subject:{' '}
              <code className="font-mono text-xs">
                customer/{customer.data?.id ?? '<org-id>'}/agent/{'<agent-id>'}
              </code>
            </p>
          </div>
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
