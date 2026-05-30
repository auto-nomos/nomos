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

const TF_MODULE_PATH = 'infra/terraform/google-nomos-bootstrap';
const GUIDE_URL = '/app/guide/cloud';

export default function GcpConnectPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const create = trpc.cloudConnections.create.useMutation({
    onSuccess: () => {
      utils.cloudConnections.list.invalidate();
      router.push('/app/cloud');
    },
  });

  const [projectId, setProjectId] = useState('');
  const [wifProvider, setWifProvider] = useState('');
  const [saEmail, setSaEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    try {
      await create.mutateAsync({
        connector: 'gcp',
        accountId: projectId.trim(),
        externalId: wifProvider.trim(),
        displayName: displayName.trim() || undefined,
        config: {
          wif_provider: wifProvider.trim(),
          service_account_email: saEmail.trim(),
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'create failed');
    }
  }

  const tfvarsSnippet = `# nomos-gcp.tf — copy into your Terraform root, then: terraform init && terraform apply
# Full walkthrough at /app/guide/cloud (Terraform section → Steps 5–6)

terraform {
  required_providers {
    google = { source = "hashicorp/google", version = "~> 6.0" }
  }
}
provider "google" {
  project = "${projectId || '<project-id>'}"
  region  = "us-central1"
}

module "nomos_gcp" {
  # Local-path source (no public registry mirror yet). Copy the dir into your own infra repo:
  source = "../credential-broker/infra/terraform/google-nomos-bootstrap"
  # Pin for prod: source = "git::https://github.com/auto-nomos/nomos.git//infra/terraform/google-nomos-bootstrap?ref=<SHA>"

  customer_id       = "<your-nomos-customer-id>"  # from /app/settings/organization
  project_id        = "${projectId || '<project-id>'}"
  nomos_oidc_issuer = "https://id.auto-nomos.com"

  # Optional: narrow permissions
  # service_account_roles = ["roles/storage.objectViewer"]
}

output "paste_into_nomos_dashboard" {
  value = {
    wif_provider          = module.nomos_gcp.wif_provider
    service_account_email = module.nomos_gcp.service_account_email
    project_id            = module.nomos_gcp.project_id
  }
}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <Link href="/app/cloud" className="text-xs text-muted-foreground hover:underline">
          ← Cloud accounts
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Connect GCP</h1>
        <p className="text-sm text-muted-foreground">
          Workload Identity Federation pool + SA impersonation. Two-hop: federation token from STS →
          impersonation token from <code>iamcredentials.googleapis.com</code>.
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Paste the Terraform outputs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="project_id">Project id</Label>
            <Input
              id="project_id"
              placeholder="my-gcp-project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="wif_provider">WIF provider resource name</Label>
            <Input
              id="wif_provider"
              placeholder="projects/12345/locations/global/workloadIdentityPools/nomos/providers/nomos-oidc"
              value={wifProvider}
              onChange={(e) => setWifProvider(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sa_email">Service account email</Label>
            <Input
              id="sa_email"
              placeholder="nomos-agent@my-gcp-project.iam.gserviceaccount.com"
              value={saEmail}
              onChange={(e) => setSaEmail(e.target.value)}
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
                create.isPending || !projectId.trim() || !wifProvider.trim() || !saEmail.trim()
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
