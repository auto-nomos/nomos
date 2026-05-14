/**
 * `nomos cloud install --aws | --azure | --gcp [--in-cloud]`
 *
 * Two modes:
 *   - default: prints the Terraform snippet customers paste into their
 *     own infra repo. Pure docs; no side effects.
 *   - --in-cloud: prints the in-cloud installer Terraform (M10) — runs
 *     a Nomos sidecar inside the customer's cloud with native identity
 *     so zero credentials cross the boundary at runtime.
 *
 * Both call out to the Terraform modules under
 * github.com/auto-nomos/terraform-{azurerm,aws,google}-nomos-bootstrap.
 *
 * The CLI does not invoke terraform itself — customers run it. That
 * keeps the trust boundary clear: code customers apply against their
 * cloud is open-source and reviewable.
 */

type Cloud = 'aws' | 'azure' | 'gcp';

const TF_REPO: Record<Cloud, string> = {
  aws: 'github.com/auto-nomos/terraform-aws-nomos-bootstrap',
  azure: 'github.com/auto-nomos/terraform-azurerm-nomos-bootstrap',
  gcp: 'github.com/auto-nomos/terraform-google-nomos-bootstrap',
};

interface InstallArgs {
  cloud: Cloud;
  customerId: string;
  inCloud: boolean;
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
  let inCloud = false;
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
    else if (arg === '--aws-region') awsRegion = argv[++i];
    else if (arg === '--subscription-id') azureSubscriptionId = argv[++i];
    else if (arg === '--project-id') gcpProjectId = argv[++i];
  }
  if (!cloud) return { error: 'cloud flag required: --aws | --azure | --gcp' };
  if (!customerId) return { error: '--customer-id required (get from Nomos dashboard)' };
  return {
    cloud,
    customerId,
    inCloud,
    ...(awsRegion ? { awsRegion } : {}),
    ...(azureSubscriptionId ? { azureSubscriptionId } : {}),
    ...(gcpProjectId ? { gcpProjectId } : {}),
  };
}

function bootstrapSnippet(args: InstallArgs): string {
  const source = `github.com/auto-nomos/terraform-${args.cloud === 'azure' ? 'azurerm' : args.cloud === 'gcp' ? 'google' : 'aws'}-nomos-bootstrap`;
  const lines = [
    `# Save as nomos.tf and run \`terraform apply\` against your ${args.cloud.toUpperCase()} account.`,
    '',
    'module "nomos" {',
    `  source  = "${source}"`,
    '  version = "0.1.0"',
    '',
    `  customer_id = "${args.customerId}"`,
  ];
  if (args.cloud === 'aws') {
    lines.push(`  region      = "${args.awsRegion ?? 'us-east-1'}"`);
  }
  if (args.cloud === 'azure') {
    lines.push(`  subscription_id = "${args.azureSubscriptionId ?? '<subscription-id>'}"`);
  }
  if (args.cloud === 'gcp') {
    lines.push(`  project_id  = "${args.gcpProjectId ?? '<project-id>'}"`);
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
  const variant =
    args.cloud === 'aws'
      ? 'aws-nomos-in-cloud'
      : args.cloud === 'azure'
        ? 'azurerm-nomos-in-cloud'
        : 'google-nomos-in-cloud';
  return [
    `# M10 — Nomos in-cloud sidecar for ${args.cloud.toUpperCase()}.`,
    '#',
    '# Deploys a tiny Nomos broker inside your cloud (Lambda / Container App /',
    '# Cloud Run) that runs with native identity. Nomos sends signed intent',
    '# envelopes; the sidecar executes against your APIs locally. Zero',
    '# credentials cross the customer<->Nomos boundary at runtime.',
    '',
    'module "nomos_sidecar" {',
    `  source  = "github.com/auto-nomos/terraform-${variant}"`,
    '  version = "0.1.0"',
    '',
    `  customer_id = "${args.customerId}"`,
    '  nomos_signing_pubkey_url = "https://id.auto-nomos.com/jwks.json"',
    '}',
    '',
  ].join('\n');
}

export async function runCloudInstall(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);
  if ('error' in parsed) {
    process.stderr.write(`nomos cloud install: ${parsed.error}\n`);
    process.stderr.write(
      'Usage: nomos cloud install --aws|--azure|--gcp --customer-id <id> [--in-cloud]\n',
    );
    process.exit(2);
  }
  const snippet = parsed.inCloud ? inCloudSnippet(parsed) : bootstrapSnippet(parsed);
  process.stdout.write(snippet);
  process.stdout.write('\n');
  process.stdout.write(
    `# Terraform module: ${TF_REPO[parsed.cloud]}\n` +
      `# After \`terraform apply\`, paste outputs into Nomos dashboard at /app/cloud.\n`,
  );
}
