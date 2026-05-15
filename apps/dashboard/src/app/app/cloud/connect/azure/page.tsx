'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '../../../../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../../../components/ui/card';
import { Input } from '../../../../../components/ui/input';
import { Label } from '../../../../../components/ui/label';
import { trpc } from '../../../../../lib/trpc';

const TF_MODULE_PATH = 'infra/terraform/azurerm-nomos-bootstrap';

export default function AzureConnectPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const create = trpc.cloudConnections.create.useMutation({
    onSuccess: () => {
      utils.cloudConnections.list.invalidate();
      router.push('/app/cloud');
    },
  });

  const [subscriptionId, setSubscriptionId] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [appObjectId, setAppObjectId] = useState('');
  const [appClientId, setAppClientId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    try {
      await create.mutateAsync({
        connector: 'azure',
        accountId: subscriptionId.trim(),
        tenantId: tenantId.trim(),
        externalId: appObjectId.trim(),
        displayName: displayName.trim() || undefined,
        config: {
          app_client_id: appClientId.trim(),
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'create failed');
    }
  }

  const tfvarsSnippet = `# Save as nomos.tf alongside the module checkout, or copy
# infra/terraform/azurerm-nomos-bootstrap/ into your own Terraform repo
# and adjust the source path.

module "nomos" {
  # Preview: no public mirror yet. Local-path source to this repo's module:
  source = "../credential-broker/infra/terraform/azurerm-nomos-bootstrap"

  customer_id       = "<your-nomos-customer-id>"  # from /app/settings/workspace
  subscription_id   = "${subscriptionId || '<subscription-id>'}"
  nomos_oidc_issuer = "https://<your-issuer-host>"  # the URL of the OIDC issuer you deployed
  # Optional: narrow Reader role assignment to one RG instead of subscription scope.
  # resource_group_name = "rg-agent-sandbox"
}

output "nomos_paste_into_dashboard" {
  value = {
    app_object_id   = module.nomos.app_object_id
    app_client_id   = module.nomos.app_client_id
    tenant_id       = module.nomos.tenant_id
    subscription_id = module.nomos.subscription_id
  }
}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <Link href="/app/cloud" className="text-xs text-muted-foreground hover:underline">
          ← Cloud accounts
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Connect Azure</h1>
        <p className="text-sm text-muted-foreground">
          Federated credential on an App Registration. Nomos mints OIDC ID tokens; AAD trusts them
          via the federated credential trust block created by the Terraform module.
        </p>
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-900 dark:text-amber-200">
          <strong>Preview.</strong> The OIDC issuer at <code>id.auto-nomos.com</code> is not
          deployed yet and there is no public Terraform mirror. Before running the snippet below you
          must deploy <code>apps/oidc-issuer</code> (Cloudflare Worker) and set{' '}
          <code>nomos_oidc_issuer</code> to its URL. See the{' '}
          <Link href="/app/guide/cloud" className="underline">
            Cloud IAM guide
          </Link>{' '}
          (Step 1) for the deploy commands.
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>1. Run the Terraform bootstrap</CardTitle>
          <CardDescription>
            Module source: <code>{TF_MODULE_PATH}</code> in this repo. Copy the directory into your
            own Terraform repo and pin to a commit SHA before any production use.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="overflow-auto rounded-md bg-zinc-900 p-3 font-mono text-xs leading-relaxed text-zinc-100">
            {tfvarsSnippet}
          </pre>
          <p className="mt-3 text-xs text-muted-foreground">
            The module creates: <code>azuread_application</code>,{' '}
            <code>azuread_service_principal</code>,{' '}
            <code>azuread_application_federated_identity_credential</code> (with{' '}
            <code>issuer = id.auto-nomos.com</code>), and <code>azurerm_role_assignment</code> at
            the chosen scope. Copy the outputs back here.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Paste the Terraform outputs</CardTitle>
          <CardDescription>
            All four fields come from <code>terraform output</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="subscription_id">Subscription id</Label>
            <Input
              id="subscription_id"
              placeholder="00000000-0000-0000-0000-000000000000"
              value={subscriptionId}
              onChange={(e) => setSubscriptionId(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tenant_id">Tenant id</Label>
            <Input
              id="tenant_id"
              placeholder="00000000-0000-0000-0000-000000000000"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="app_object_id">App registration object id</Label>
            <Input
              id="app_object_id"
              placeholder="object-id from terraform output app_object_id"
              value={appObjectId}
              onChange={(e) => setAppObjectId(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="app_client_id">App registration client id (application id)</Label>
            <Input
              id="app_client_id"
              placeholder="client-id from terraform output app_client_id"
              value={appClientId}
              onChange={(e) => setAppClientId(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="display_name">Display name (optional)</Label>
            <Input
              id="display_name"
              placeholder="prod-readonly"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Link href="/app/cloud">
              <Button variant="ghost">Cancel</Button>
            </Link>
            <Button
              onClick={submit}
              disabled={
                create.isPending ||
                !subscriptionId.trim() ||
                !tenantId.trim() ||
                !appObjectId.trim() ||
                !appClientId.trim()
              }
            >
              {create.isPending ? 'Saving…' : 'Save connection'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
