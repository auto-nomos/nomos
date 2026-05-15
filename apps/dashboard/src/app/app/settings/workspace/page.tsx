'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../../components/ui/card';
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
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <div className="flex items-center gap-2">
        <code
          className={`flex-1 rounded border border-aegis-line bg-aegis-well px-3 py-2 text-sm ${mono ? 'font-mono' : ''} text-aegis-paper select-all`}
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

export default function WorkspaceSettingsPage() {
  const customer = trpc.customers.get.useQuery();
  const data = customer.data;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Workspace</h1>
        <p className="text-sm text-muted-foreground">
          IDs and identifiers for this organization. Use these when configuring Terraform, the SDK,
          or cloud IAM integrations.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Organization identifiers</CardTitle>
          <CardDescription>Paste these into Terraform modules and SDK config.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data ? (
            <>
              <CopyField label="Organization ID (customer_id)" value={data.id} />
              <CopyField label="Slug" value={data.name ?? ''} />
              {data.displayName ? (
                <CopyField label="Display name" value={data.displayName} mono={false} />
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
            <span className="mt-0.5 font-mono text-xs text-aegis-mute shrink-0">TF</span>
            <p>
              Set <code className="font-mono text-xs">customer_id</code> in the{' '}
              <code className="font-mono text-xs">nomos_azure</code> module — this scopes the
              federated identity credential to your org.
            </p>
          </div>
          <div className="flex gap-3">
            <span className="mt-0.5 font-mono text-xs text-aegis-mute shrink-0">SDK</span>
            <p>
              Passed automatically via the API key — you don&apos;t need to supply it manually
              unless you&apos;re constructing raw UCAN tokens.
            </p>
          </div>
          <div className="flex gap-3">
            <span className="mt-0.5 font-mono text-xs text-aegis-mute shrink-0">OIDC</span>
            <p>
              Nomos embeds this ID in the federated token subject:{' '}
              <code className="font-mono text-xs">
                customer/{data?.id ?? '<org-id>'}/agent/{'<agent-id>'}
              </code>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
