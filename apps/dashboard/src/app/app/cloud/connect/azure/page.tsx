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
const GUIDE_URL = '/app/guide/cloud';

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

  const tfvarsSnippet = `# nomos-azure.tf — copy into your Terraform root, then: terraform init && terraform apply
# Full walkthrough at /app/guide/cloud (Terraform section → Steps 5–6)

terraform {
  required_providers {
    azurerm = { source = "hashicorp/azurerm", version = "~> 4.0" }
    azuread = { source = "hashicorp/azuread", version = "~> 3.0" }
  }
}
provider "azurerm" {
  features {}
  subscription_id = "${subscriptionId || '<subscription-id>'}"
}

module "nomos_azure" {
  # Fetches the module directly from GitHub — no local clone needed.
  # Pin <SHA> to a specific commit for reproducible production deploys.
  source = "git::https://github.com/varendra007/nomos-terraforms.git//azurerm-nomos-bootstrap?ref=main"

  customer_id     = "<your-nomos-customer-id>"  # from /app/settings/workspace
  subscription_id = "${subscriptionId || '<subscription-id>'}"

  # One federated credential is created per agent_id. The "verify-poll" id
  # is always included so the dashboard "Verify now" button works. Add
  # real agent ids here as you create agents in Nomos. Azure caps the
  # total at 20 federated credentials per app.
  additional_agent_ids = [
    # "agt_01H9XYZ...",
  ]

  # Optional: narrow Reader to one resource group
  # resource_group_name = "rg-agent-sandbox"
}

output "paste_into_nomos_dashboard" {
  value = {
    app_object_id   = module.nomos_azure.app_object_id
    app_client_id   = module.nomos_azure.app_client_id
    tenant_id       = module.nomos_azure.tenant_id
    subscription_id = module.nomos_azure.subscription_id
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
          Nomos brokers Azure calls without storing any secret. It mints a short-lived OIDC token
          per agent request; Azure validates it via a federated credential trust and issues a
          session credential (1–15 min TTL). Revoking the connection instantly cuts access.
        </p>
        <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-3 text-xs text-blue-900 dark:text-blue-200">
          OIDC issuer live at <code>id.auto-nomos.com</code>. Full setup walkthrough — Terraform,
          env vars, Cedar policy, first call — at{' '}
          <Link href={GUIDE_URL} className="underline">
            Cloud IAM guide
          </Link>{' '}
          (Terraform section + Steps 5–8).
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What gets created — and why</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="flex gap-3">
            <span className="mt-0.5 shrink-0 font-mono text-xs text-aegis-mute">App Reg + SP</span>
            <p>
              Azure&apos;s identity object for an external workload. Nomos agents authenticate
              <em> as</em> this Service Principal — no password, no client secret.
            </p>
          </div>
          <div className="flex gap-3">
            <span className="mt-0.5 shrink-0 font-mono text-xs text-aegis-mute">
              Federated creds
            </span>
            <p>
              One trust rule per agent_id. Each says: &ldquo;when <code>id.auto-nomos.com</code>{' '}
              presents a token with subject{' '}
              <code>
                customer/{'<org-id>'}/agent/{'<agent-id>'}
              </code>
              , accept it as this SP.&rdquo; Pure OIDC — no secrets to rotate or leak. Azure caps
              these at 20 per app and requires an <em>exact</em> subject string (wildcards not
              supported).
            </p>
          </div>
          <div className="flex gap-3">
            <span className="mt-0.5 shrink-0 font-mono text-xs text-aegis-mute">Reader role</span>
            <p>
              Grants the SP permission to call Azure APIs at subscription (or resource group) scope.
              Without this the token exchange succeeds but every API call returns 403.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>1a. Run the Terraform bootstrap</CardTitle>
          <CardDescription>
            Fastest path — one <code>terraform apply</code> creates all three resources and outputs
            the four values you need. Module source: <code>{TF_MODULE_PATH}</code>. Copy it into
            your own Terraform repo and pin to a commit SHA before any production use.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="overflow-auto rounded-md bg-zinc-900 p-3 font-mono text-xs leading-relaxed text-zinc-100">
            {tfvarsSnippet}
          </pre>
          <p className="mt-3 text-xs text-muted-foreground">
            Run: <code>terraform init &amp;&amp; terraform apply</code>, then{' '}
            <code>terraform output paste_into_nomos_dashboard</code> and paste the four values into
            step 2 below.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>1b. Alternative — Azure CLI (no Terraform required)</CardTitle>
          <CardDescription>
            Creates the same three resources using <code>az</code> commands. Run{' '}
            <code>az login</code> first (or <code>az login --use-device-code</code> if no browser).
            Copy the four output values into step 2 below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <pre className="overflow-auto rounded-md bg-zinc-900 p-3 font-mono text-xs leading-relaxed text-zinc-100">{`# 1. App Registration + Service Principal
APP=$(az ad app create --display-name "nomos-agent-broker" \\
      --query "{appId:appId,id:id}" -o json)
APP_CLIENT_ID=$(echo $APP | jq -r .appId)
APP_OBJ_ID=$(echo $APP | jq -r .id)
SP_ID=$(az ad sp create --id $APP_CLIENT_ID --query "id" -o tsv)

# 2. Federated Identity Credential (OIDC trust — no secrets)
#    One FIC per agent_id. "verify-poll" is required so /app/cloud
#    "Verify now" succeeds. Add one block per real agent (max 20 total).
az ad app federated-credential create --id $APP_OBJ_ID --parameters '{
  "name": "nomos-verify-poll",
  "issuer": "https://id.auto-nomos.com",
  "subject": "customer/<your-customer-id>/agent/verify-poll",
  "audiences": ["api://AzureADTokenExchange"]
}'
# Repeat for each agent_id that should call Azure through Nomos:
# az ad app federated-credential create --id $APP_OBJ_ID --parameters '{
#   "name": "nomos-agt_01HXYZ",
#   "issuer": "https://id.auto-nomos.com",
#   "subject": "customer/<your-customer-id>/agent/agt_01HXYZ...",
#   "audiences": ["api://AzureADTokenExchange"]
# }'

# 3. Reader role at subscription scope
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
az role assignment create \\
  --assignee $SP_ID \\
  --role "Reader" \\
  --scope "/subscriptions/$SUBSCRIPTION_ID"

# 4. Print the four values to paste into Nomos
TENANT_ID=$(az account show --query tenantId -o tsv)
echo "app_object_id:   $APP_OBJ_ID"
echo "app_client_id:   $APP_CLIENT_ID"
echo "tenant_id:       $TENANT_ID"
echo "subscription_id: $SUBSCRIPTION_ID"`}</pre>
          <p className="text-xs text-muted-foreground">
            Replace <code>{'<your-customer-id>'}</code> with your Nomos org ID from{' '}
            <Link href="/app/settings/workspace" className="underline">
              Settings → Workspace
            </Link>
            .
          </p>
        </CardContent>
      </Card>

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardHeader>
          <CardTitle className="text-base text-amber-200">
            Important — Azure federated credential limits
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-amber-100/80">
          <p>
            Azure federated credentials require an <strong>exact</strong> subject string — wildcards
            (<code>customer/.../agent/*</code>) are <em>not</em> supported and will silently fail
            token exchange with a 401.
          </p>
          <p>
            Microsoft&apos;s flexible-FIC <code>claimsMatchingExpression</code> is also blocked for
            custom OIDC issuers like <code>id.auto-nomos.com</code> — it returns{' '}
            <code>
              Expression is not supported for applications in this cloud &apos;Public&apos;
            </code>
            .
          </p>
          <p>
            Result: one federated credential per agent_id. Azure caps the total at{' '}
            <strong>20 per app registration</strong>. Need more? Deploy this module a second time
            (separate app) or split agents across subscriptions.
          </p>
          <p className="border-t border-amber-500/20 pt-2 mt-2">
            <strong>Each app you register on Nomos needs its own FIC.</strong> Every time you create
            a new app at <code>/app/agents/new</code>, register a credential matching
            <code className="mx-1">customer/&lt;cid&gt;/agent/&lt;agent_id&gt;</code> in this same
            App Registration. The app detail page surfaces the exact{' '}
            <code>az ad app federated-credential create</code> command pre-filled — just copy-paste
            it. Skipping this step results in{' '}
            <code>AADSTS700213: No matching federated identity record</code>.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Paste the four output values</CardTitle>
          <CardDescription>
            From <code>terraform output paste_into_nomos_dashboard</code> or the <code>echo</code>{' '}
            commands in step 1b above.
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
              placeholder="app_object_id from terraform output or echo command"
              value={appObjectId}
              onChange={(e) => setAppObjectId(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="app_client_id">App registration client id (application id)</Label>
            <Input
              id="app_client_id"
              placeholder="app_client_id from terraform output or echo command"
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
