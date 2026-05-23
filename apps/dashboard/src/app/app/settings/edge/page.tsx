'use client';

import { Check, Copy, ExternalLink, Server, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
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
          className={`flex-1 rounded border border-aegis-line bg-aegis-well px-3 py-2 text-sm ${mono ? 'font-mono' : ''} text-aegis-paper select-all break-all`}
        >
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded border border-aegis-line p-2 text-aegis-mute transition-colors hover:border-aegis-line-strong hover:text-aegis-paper"
          title="Copy"
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

function CodeBlock({ value, language = 'bash' }: { value: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded border border-aegis-line bg-aegis-well p-3 text-xs text-aegis-paper">
        <code className={`language-${language}`}>{value}</code>
      </pre>
      <button
        type="button"
        onClick={copy}
        className="absolute right-2 top-2 rounded border border-aegis-line bg-aegis-bg p-1.5 text-aegis-mute hover:text-aegis-paper"
        title="Copy"
      >
        {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  );
}

export default function EdgeSettingsPage() {
  const install = trpc.edge.getInstallContext.useQuery();
  const data = install.data;

  const helmCmd = data
    ? `helm install pdp oci://ghcr.io/varendra007/charts/cb-pdp \\
  --namespace cb-pdp --create-namespace \\
  --set image.repository=ghcr.io/varendra007/cb-pdp \\
  --set image.tag=v0.1.0 \\
  --set controlPlane.url=https://api.auto-nomos.com \\
  --set secret.controlPlaneServiceToken="<paste API key>" \\
  --set secret.bundleVerifyKey="${data.bundleVerifyKeyHex}" \\
  --set customerIdsOverride="${data.customerId}"`
    : '';

  const composeEnv = data
    ? `CONTROL_PLANE_URL=https://api.auto-nomos.com
CONTROL_PLANE_SERVICE_TOKEN=<paste API key>
CONTROL_PLANE_BUNDLE_VERIFY_KEY=${data.bundleVerifyKeyHex}
PDP_CUSTOMER_IDS=${data.customerId}
AUDIT_BACKEND=jsonl
AUDIT_LOG_PATH=/var/audit/pdp.log`
    : '';

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Server className="mt-1 h-6 w-6 text-aegis-mute" />
        <div>
          <h1 className="text-xl font-semibold text-aegis-paper">Edge PDP install</h1>
          <p className="text-sm text-aegis-mute">
            Run the Nomos Policy Decision Point in your own infrastructure. The control-plane stays
            managed; auth decisions never leave your perimeter.
          </p>
        </div>
      </div>

      {install.isLoading && <p className="text-sm text-aegis-mute">Loading…</p>}
      {install.isError && <p className="text-sm text-red-400">Failed to load install context.</p>}

      {data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-aegis-mute" />
                Trust anchors
              </CardTitle>
              <CardDescription>
                Paste these into your PDP install. The signer DID and bundle verify key are derived
                from the control-plane signing key actively in use — they rotate when the key
                rotates.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <CopyField label="Customer ID" value={data.customerId ?? ''} />
              <CopyField label="Signer DID" value={data.signerDid} />
              <CopyField label="Bundle verify key (hex Ed25519)" value={data.bundleVerifyKeyHex} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Service token</CardTitle>
              <CardDescription>
                The PDP authenticates to the control-plane with a long-lived API key. Use the Agents
                page to mint one — any role works; for least privilege use the <code>auditor</code>{' '}
                role.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href="/app/agents"
                className="inline-flex items-center gap-2 rounded border border-aegis-line bg-aegis-well px-3 py-2 text-sm text-aegis-paper hover:border-aegis-line-strong"
              >
                Go to Agents → mint API key <ExternalLink className="h-3 w-3" />
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Helm (Kubernetes)</CardTitle>
              <CardDescription>
                Drop-in install. Opt in to ingress / HPA / NetworkPolicy / ServiceMonitor / PDB via{' '}
                <Link
                  href="https://github.com/varendra007/nomos/blob/main/infrastructure/helm/cb-pdp/values.yaml"
                  className="underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  values.yaml
                </Link>
                .
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CodeBlock value={helmCmd} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>docker-compose</CardTitle>
              <CardDescription>
                Single-service alternative. Copy this into{' '}
                <code>infrastructure/docker/.env.edge</code> next to{' '}
                <code>docker-compose.edge.yml</code>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CodeBlock value={composeEnv} language="dotenv" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Verify image signature</CardTitle>
              <CardDescription>
                Every <code>pdp-v*</code> tag pushed to GHCR is signed with cosign keyless (Sigstore
                OIDC). Verify before deploy:
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CodeBlock
                value={`cosign verify ghcr.io/varendra007/cb-pdp:v0.1.0 \\
  --certificate-identity-regexp 'https://github.com/varendra007/nomos/.github/workflows/release-pdp-image\\.yml.*' \\
  --certificate-oidc-issuer https://token.actions.githubusercontent.com`}
              />
            </CardContent>
          </Card>

          <p className="text-sm text-aegis-mute">
            Full walkthrough (three deploy modes, day-2 ops, troubleshooting):{' '}
            <Link
              href="https://github.com/varendra007/nomos/blob/main/docs/SELF_HOSTING.md"
              className="underline"
              target="_blank"
              rel="noreferrer"
            >
              docs/SELF_HOSTING.md
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}
