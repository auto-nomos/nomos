#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type AuditBundle, verifyBundle } from './verify.js';

interface ParsedArgs {
  bundle?: string;
  pubkey?: string;
  chain?: string;
  help?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--bundle' || arg === '-b') {
      out.bundle = argv[++i];
    } else if (arg === '--pubkey' || arg === '-k') {
      out.pubkey = argv[++i];
    } else if (arg === '--chain' || arg === '-c') {
      out.chain = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      out.help = true;
    }
  }
  return out;
}

function printHelp(): void {
  process.stdout.write(`audit-verify — verify a credential-broker audit bundle

Usage:
  audit-verify --bundle <path> [--pubkey <hex>]
  audit-verify --chain  <path> [--pubkey <hex>]

Flags:
  --bundle, -b   Path to a JSON audit bundle (the response of
                 GET /v1/audit/:eventId/proof, saved to disk).
  --chain, -c    Path to a JSON audit bundle whose events form a parent_receipt_id
                 causation chain. Walks parent links and prints a tree.
                 Hash chain integrity is still verified per node.
  --pubkey, -k   Hex AUDIT_VERIFY_KEY (32 bytes / 64 hex chars). Reads
                 process.env.AUDIT_VERIFY_KEY when omitted.
  --help, -h     Show this message.

Exit codes:
  0  bundle is internally consistent + (if signed) signature matches.
  1  one or more verification failures (details on stderr).
  2  CLI usage error.
`);
}

interface ChainEvent {
  event_id: string;
  parent_receipt_id?: string;
  decision: string;
  command: string;
  agent: string;
  chain_depth?: number;
  swarm_id?: string;
  ts?: number;
}

function printChainTree(events: ChainEvent[]): void {
  const byId = new Map<string, ChainEvent>();
  for (const ev of events) byId.set(ev.event_id, ev);
  const childrenOf = new Map<string | undefined, ChainEvent[]>();
  for (const ev of events) {
    const arr = childrenOf.get(ev.parent_receipt_id) ?? [];
    arr.push(ev);
    childrenOf.set(ev.parent_receipt_id, arr);
  }
  const roots = events.filter((ev) => !ev.parent_receipt_id || !byId.has(ev.parent_receipt_id));
  const colorFor = (decision: string): string => {
    if (decision === 'allow') return '\x1b[32mALLOW\x1b[0m';
    if (decision === 'stepup') return '\x1b[33mSTEPUP\x1b[0m';
    return '\x1b[31mDENY\x1b[0m';
  };
  function walk(node: ChainEvent, prefix: string, isLast: boolean): void {
    const branch = prefix === '' ? '' : isLast ? '└── ' : '├── ';
    const suffix = node.swarm_id ? ` swarm=${node.swarm_id.slice(0, 8)}` : '';
    process.stdout.write(
      `${prefix}${branch}${colorFor(node.decision)} ${node.command} agent=${node.agent} ` +
        `depth=${node.chain_depth ?? 0} id=${node.event_id.slice(0, 8)}${suffix}\n`,
    );
    const kids = childrenOf.get(node.event_id) ?? [];
    const nextPrefix = prefix + (isLast ? '    ' : '│   ');
    for (let idx = 0; idx < kids.length; idx++) {
      walk(kids[idx] as ChainEvent, nextPrefix, idx === kids.length - 1);
    }
  }
  for (let idx = 0; idx < roots.length; idx++) {
    walk(roots[idx] as ChainEvent, '', idx === roots.length - 1);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  const bundlePath = args.bundle ?? args.chain;
  if (!bundlePath) {
    process.stderr.write('error: --bundle or --chain is required\n');
    printHelp();
    process.exit(2);
  }
  const pubkey = args.pubkey ?? process.env.AUDIT_VERIFY_KEY ?? '';
  if (!pubkey) {
    process.stderr.write('error: --pubkey or AUDIT_VERIFY_KEY must be provided\n');
    process.exit(2);
  }
  let bundle: AuditBundle;
  try {
    bundle = JSON.parse(readFileSync(resolve(bundlePath), 'utf8')) as AuditBundle;
  } catch (err) {
    process.stderr.write(`error: failed to read bundle: ${(err as Error).message}\n`);
    process.exit(2);
  }

  const result = verifyBundle(bundle, pubkey);
  if (!result.ok) {
    process.stderr.write(`FAIL: ${result.errors.length} verification error(s):\n`);
    for (const err of result.errors) {
      const where = err.index !== undefined ? `[event #${err.index}]` : '[bundle]';
      process.stderr.write(`  ${where} ${err.reason}${err.detail ? `: ${err.detail}` : ''}\n`);
    }
    process.exit(1);
  }
  if (args.chain) {
    process.stdout.write(`OK: ${bundle.events.length} events, hash chain verified.\n\n`);
    printChainTree(bundle.events as unknown as ChainEvent[]);
    process.exit(0);
  }
  process.stdout.write(
    `OK: ${bundle.events.length} events verified${
      result.signedAt
        ? `, anchored by signed root @ ${result.signedAt} (key=${result.signingKeyId ?? 'unknown'})`
        : ' (no signed root yet)'
    }\n`,
  );
  process.exit(0);
}

void main();
