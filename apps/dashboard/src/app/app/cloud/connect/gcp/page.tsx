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

  const tfvarsSnippet = `# Save as nomos.tf alongside the module checkout, or copy
# infra/terraform/google-nomos-bootstrap/ into your own Terraform repo
# and adjust the source path.

module "nomos" {
  # Preview: no public mirror yet. Local-path source to this repo's module:
  source = "../credential-broker/infra/terraform/google-nomos-bootstrap"

  customer_id       = "<your-nomos-customer-id>"  # from /app/settings/workspace
  project_id        = "${projectId || '<project-id>'}"
  nomos_oidc_issuer = "https://<your-issuer-host>"  # the URL of the OIDC issuer you deployed
}

output "nomos_paste_into_dashboard" {
  value = {
    wif_provider          = module.nomos.wif_provider
    service_account_email = module.nomos.service_account_email
    project_id            = module.nomos.project_id
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
