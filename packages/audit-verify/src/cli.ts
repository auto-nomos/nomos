#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type AuditBundle, verifyBundle } from './verify.js';

interface ParsedArgs {
  bundle?: string;
  pubkey?: string;
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

Flags:
  --bundle, -b   Path to a JSON audit bundle (the response of
                 GET /v1/audit/:eventId/proof, saved to disk).
  --pubkey, -k   Hex AUDIT_VERIFY_KEY (32 bytes / 64 hex chars). Reads
                 process.env.AUDIT_VERIFY_KEY when omitted.
  --help, -h     Show this message.

Exit codes:
  0  bundle is internally consistent + (if signed) signature matches.
  1  one or more verification failures (details on stderr).
  2  CLI usage error.
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  if (!args.bundle) {
    process.stderr.write('error: --bundle is required\n');
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
    bundle = JSON.parse(readFileSync(resolve(args.bundle), 'utf8')) as AuditBundle;
  } catch (err) {
    process.stderr.write(`error: failed to read bundle: ${(err as Error).message}\n`);
    process.exit(2);
  }

  const result = verifyBundle(bundle, pubkey);
  if (result.ok) {
    process.stdout.write(
      `OK: ${bundle.events.length} events verified${
        result.signedAt
          ? `, anchored by signed root @ ${result.signedAt} (key=${result.signingKeyId ?? 'unknown'})`
          : ' (no signed root yet)'
      }\n`,
    );
    process.exit(0);
  }
  process.stderr.write(`FAIL: ${result.errors.length} verification error(s):\n`);
  for (const err of result.errors) {
    const where = err.index !== undefined ? `[event #${err.index}]` : '[bundle]';
    process.stderr.write(`  ${where} ${err.reason}${err.detail ? `: ${err.detail}` : ''}\n`);
  }
  process.exit(1);
}

void main();
