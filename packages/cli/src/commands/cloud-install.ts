/**
 * `nomos cloud install --aws | --azure | --gcp [--in-cloud]`
 *
 * Prints a Terraform snippet you paste into your own infra repo. The CLI
 * does not invoke terraform itself — you run it. That keeps the trust
 * boundary clear: the IAM that lands in your cloud is code you read.
 *
 * Two modes:
 *   - default: prints the bootstrap module (App Reg / IAM Role / WIF pool)
 *     for the chosen cloud.
 *   - --in-cloud: prints the in-cloud sidecar variant (M10) — runs a Nomos
 *     sidecar inside your cloud with native identity so zero credentials
 *     cross the boundary at runtime.
 *
 * Source path: in preview there is no public Terraform mirror. The CLI
 * defaults to a local path source `../credential-broker/infra/terraform/...`
 * relative to where you save the snippet. Override with `--source <expr>`
 * once you have copied the module out into your own infra repo (recommended
 * for production — pin to a commit SHA).
 *
 * Required env / inputs:
 *   --customer-id <uuid>     (from /app/settings/workspace)
 *   --nomos-oidc-issuer <url>  (the OIDC issuer you deployed — see
 *                               apps/oidc-issuer/ for the Worker source)
 */

type Cloud = 'aws' | 'azure' | 'gcp';

const MODULE_DIR: Record<Cloud, string> = {
  aws: 'aws-nomos-bootstrap',
  azure: 'azurerm-nomos-bootstrap',
  gcp: 'google-nomos-bootstrap',
};

const DEFAULT_SOURCE_PREFIX = '../credential-broker/infra/terraform';

interface InstallArgs {
  cloud: Cloud;
  customerId: string;
  oidcIssuer: string;
  inCloud: boolean;
  source?: string;
  // AWS-specific
  awsRegion?: string;
  // Azure-specific
  azureSubscriptionId?: string;
  // GCP-specific
  gcpProjectId?: string;
}

function parseArgs(argv: string[]): InstallArgs | { error: string } {
  let cloud: Cloud | undefined;
  let customerId = '';
  let oidcIssuer = '';
  let inCloud = false;
  let source: string | undefined;
  let awsRegion: string | undefined;
  let azureSubscriptionId: string | undefined;
  let gcpProjectId: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg === '--aws') cloud = 'aws';
    else if (arg === '--azure') cloud = 'azure';
    else if (arg === '--gcp') cloud = 'gcp';
    else if (arg === '--in-cloud') inCloud = true;
    else if (arg === '--customer-id') customerId = argv[++i] ?? '';
    else if (arg === '--nomos-oidc-issuer') oidcIssuer = argv[++i] ?? '';
    else if (arg === '--source') source = argv[++i];
    else if (arg === '--aws-region') awsRegion = argv[++i];
    else if (arg === '--subscription-id') azureSubscriptionId = argv[++i];
    else if (arg === '--project-id') gcpProjectId = argv[++i];
  }
  if (!cloud) return { error: 'cloud flag required: --aws | --azure | --gcp' };
  if (!customerId) return { error: '--customer-id required (from /app/settings/workspace)' };
  return {
    cloud,
    customerId,
    oidcIssuer: oidcIssuer || '<your-nomos-oidc-issuer-url>',
    inCloud,
    ...(source ? { source } : {}),
    ...(awsRegion ? { awsRegion } : {}),
    ...(azureSubscriptionId ? { azureSubscriptionId } : {}),
    ...(gcpProjectId ? { gcpProjectId } : {}),
  };
}

function bootstrapSnippet(args: InstallArgs): string {
  const source = args.source ?? `${DEFAULT_SOURCE_PREFIX}/${MODULE_DIR[args.cloud]}`;
  const lines = [
    `# Save as nomos.tf, then run \`terraform init && terraform apply\`.`,
    `# After apply, run \`terraform output paste_into_nomos_dashboard\` and`,
    `# paste the values at https://<your-nomos-host>/app/cloud/connect/${args.cloud}`,
    '#',
    `# Preview note: there is no public Terraform mirror yet. The default`,
    `# source below is a local path to this repo's module directory; copy`,
    `# infra/terraform/${MODULE_DIR[args.cloud]}/ into your own infra repo`,
    `# and pin to a commit SHA before any production use.`,
    '',
    'module "nomos" {',
    `  source = "${source}"`,
    '',
    `  customer_id       = "${args.customerId}"`,
    `  nomos_oidc_issuer = "${args.oidcIssuer}"`,
  ];
  if (args.cloud === 'aws') {
    lines.push(`  region            = "${args.awsRegion ?? 'us-east-1'}"`);
  }
  if (args.cloud === 'azure') {
    lines.push(
      `  subscription_id   = "${args.azureSubscriptionId ?? '<your-azure-subscription-id>'}"`,
    );
  }
  if (args.cloud === 'gcp') {
    lines.push(`  project_id        = "${args.gcpProjectId ?? '<your-gcp-project-id>'}"`);
  }
  lines.push('}', '');
  lines.push('output "paste_into_nomos_dashboard" {');
  if (args.cloud === 'aws') {
    lines.push('  value = {');
    lines.push('    role_arn   = module.nomos.role_arn');
    lines.push('    account_id = module.nomos.account_id');
    lines.push('    region     = module.nomos.region');
    lines.push('  }');
  }
  if (args.cloud === 'azure') {
    lines.push('  value = {');
    lines.push('    app_object_id   = module.nomos.app_object_id');
    lines.push('    app_client_id   = module.nomos.app_client_id');
    lines.push('    tenant_id       = module.nomos.tenant_id');
    lines.push('    subscription_id = module.nomos.subscription_id');
    lines.push('  }');
  }
  if (args.cloud === 'gcp') {
    lines.push('  value = {');
    lines.push('    wif_provider          = module.nomos.wif_provider');
    lines.push('    service_account_email = module.nomos.service_account_email');
    lines.push('    project_id            = module.nomos.project_id');
    lines.push('  }');
  }
  lines.push('}', '');
  return lines.join('\n');
}

function inCloudSnippet(args: InstallArgs): string {
  return [
    `# M10 — Nomos in-cloud sidecar for ${args.cloud.toUpperCase()}.`,
    `#`,
    `# Not yet shipped as a stable Terraform module. The sidecar pattern runs`,
    `# a tiny Nomos broker inside your cloud (Lambda / Container App /`,
    `# Cloud Run) with native identity, so zero credentials cross the`,
    `# customer<->Nomos boundary at runtime. Track progress in the milestone`,
    `# M10 in apps/control-plane/CLOUD_IAM.md.`,
    `#`,
    `# For now use the standard bootstrap module above and re-run \`nomos cloud install\``,
    `# without --in-cloud.`,
    '',
  ].join('\n');
}

export async function runCloudInstall(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);
  if ('error' in parsed) {
    process.stderr.write(`nomos cloud install: ${parsed.error}\n`);
    process.stderr.write(
      'Usage: nomos cloud install --aws|--azure|--gcp \\\n' +
        '         --customer-id <uuid> \\\n' +
        '         --nomos-oidc-issuer <https://...>  # required for AAD/STS/WIF to trust us\n' +
        '         [--source <terraform-source-expr>] \\\n' +
        '         [--aws-region us-east-1 | --subscription-id <id> | --project-id <id>] \\\n' +
        '         [--in-cloud]\n',
    );
    process.exit(2);
  }
  const snippet = parsed.inCloud ? inCloudSnippet(parsed) : bootstrapSnippet(parsed);
  process.stdout.write(snippet);
  process.stdout.write('\n');
  if (!parsed.inCloud) {
    process.stdout.write(
      `# Module source path used: ${parsed.source ?? `${DEFAULT_SOURCE_PREFIX}/${MODULE_DIR[parsed.cloud]}`}\n` +
        `# Override with --source <expr> once you copy the module into your own Terraform repo.\n` +
        `# After \`terraform apply\`, paste outputs at /app/cloud/connect/${parsed.cloud}.\n`,
    );
  }
}
