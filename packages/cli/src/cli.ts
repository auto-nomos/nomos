import { runCloudInstall } from './commands/cloud-install.js';
import { type AgentClient, connectAgent } from './commands/connect-agent.js';
import { runSetup } from './commands/setup.js';
import { runStatus } from './commands/status.js';
import { runTui } from './commands/tui.js';

const HELP = `cb — credential-broker CLI

Commands:
  cb setup [--force]
      Generate signing keys + secrets, write .env.local, run db migrations.

  cb status [--cp <url>] [--pdp <url>]
      Check control-plane / pdp / dashboard health.

  cb connect-agent <client> [--out <dir>] [--cp <url>] [--pdp <url>] [--api-key <key>]
      <client>: claude-code | claude-desktop | cursor | chatgpt | custom

  cb tui
      Launch the terminal approval / audit UI.

  cb cloud install --aws|--azure|--gcp --customer-id <id> [--in-cloud]
      Print the Terraform snippet to bootstrap federated cloud IAM (M5/M1/M7),
      or with --in-cloud, the Nomos sidecar variant (M10).

  cb help | --help | -h
      Show this help.

  cb version | --version | -v
      Print version.

Environment:
  CB_CONTROL_PLANE_URL    default: http://localhost:8788
  CB_PDP_URL              default: http://localhost:8787
  CB_API_KEY              cb_<customerId>_<secret>
`;

const PKG_VERSION = '0.0.0';

const AGENT_CLIENTS: AgentClient[] = [
  'claude-code',
  'claude-desktop',
  'cursor',
  'chatgpt',
  'custom',
];

export async function run(argv: string[]): Promise<void> {
  const cmd = argv[0];
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    process.stdout.write(HELP);
    return;
  }
  if (cmd === 'version' || cmd === '--version' || cmd === '-v') {
    process.stdout.write(`cb ${PKG_VERSION}\n`);
    return;
  }
  if (cmd === 'setup') {
    await runSetup(argv.slice(1));
    return;
  }
  if (cmd === 'status') {
    await runStatus(argv.slice(1));
    return;
  }
  if (cmd === 'connect-agent') {
    const target = argv[1];
    if (!target || !AGENT_CLIENTS.includes(target as AgentClient)) {
      process.stderr.write(
        `cb connect-agent: client required. One of: ${AGENT_CLIENTS.join(', ')}\n`,
      );
      process.exit(2);
    }
    await connectAgent(target as AgentClient, argv.slice(2));
    return;
  }
  if (cmd === 'tui') {
    await runTui(argv.slice(1));
    return;
  }
  if (cmd === 'cloud') {
    const sub = argv[1];
    if (sub !== 'install') {
      process.stderr.write(`cb cloud: unknown subcommand '${sub ?? ''}' (expected: install)\n`);
      process.exit(2);
    }
    await runCloudInstall(argv.slice(2));
    return;
  }
  process.stderr.write(`cb: unknown command '${cmd}'\n\n${HELP}`);
  process.exit(2);
}

export { HELP };
