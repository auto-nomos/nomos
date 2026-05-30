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

const TF_MODULE_PATH = 'infra/terraform/aws-nomos-bootstrap';
const GUIDE_URL = '/app/guide/cloud';

export default function AwsConnectPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const create = trpc.cloudConnections.create.useMutation({
    onSuccess: () => {
      utils.cloudConnections.list.invalidate();
      router.push('/app/cloud');
    },
  });

  const [accountId, setAccountId] = useState('');
  const [roleArn, setRoleArn] = useState('');
  const [region, setRegion] = useState('us-east-1');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    try {
      await create.mutateAsync({
        connector: 'aws',
        accountId: accountId.trim(),
        externalId: roleArn.trim(),
        displayName: displayName.trim() || undefined,
        config: {
          role_arn: roleArn.trim(),
          region: region.trim() || 'us-east-1',
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'create failed');
    }
  }

  const tfvarsSnippet = `# nomos-aws.tf — copy into your Terraform root, then: terraform init && terraform apply
# Full walkthrough at /app/guide/cloud (Terraform section → Steps 5–6)

terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
    tls = { source = "hashicorp/tls", version = "~> 4.0" }
  }
}
provider "aws" { region = "${region}" }

module "nomos_aws" {
  # Local-path source (no public registry mirror yet). Copy the dir into your own infra repo:
  source = "../credential-broker/infra/terraform/aws-nomos-bootstrap"
  # Pin for prod: source = "git::https://github.com/auto-nomos/nomos.git//infra/terraform/aws-nomos-bootstrap?ref=<SHA>"

  customer_id       = "<your-nomos-customer-id>"  # from /app/settings/organization
  region            = "${region}"
  nomos_oidc_issuer = "https://id.auto-nomos.com"

  # Optional: narrow permissions
  # managed_policy_arns = ["arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess"]
}

output "paste_into_nomos_dashboard" {
  value = {
    role_arn   = module.nomos_aws.role_arn
    account_id = module.nomos_aws.account_id
    region     = module.nomos_aws.region
  }
}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <Link href="/app/cloud" className="text-xs text-muted-foreground hover:underline">
          ← Cloud accounts
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Connect AWS</h1>
        <p className="text-sm text-muted-foreground">
          IAM OIDC trust with <code>sts:AssumeRoleWithWebIdentity</code>. Nomos mints OIDC ID
          tokens; STS exchanges them for short-lived AccessKey/SecretKey/SessionToken.
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
            <Label htmlFor="account_id">AWS account id</Label>
            <Input
              id="account_id"
              placeholder="123456789012"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="role_arn">Role ARN</Label>
            <Input
              id="role_arn"
              placeholder="arn:aws:iam::123456789012:role/nomos-agent-broker"
              value={roleArn}
              onChange={(e) => setRoleArn(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="region">STS region</Label>
            <Input
              id="region"
              placeholder="us-east-1"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
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
              disabled={create.isPending || !accountId.trim() || !roleArn.trim()}
            >
              {create.isPending ? 'Saving…' : 'Save connection'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
