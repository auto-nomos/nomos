#!/usr/bin/env node
/**
 * nomos-ucan — language-agnostic helper for non-TS agent runtimes.
 *
 * Subcommands:
 *   mint     — mint a UCAN from JSON payload + private key (hex).
 *   fork     — append child UCAN to parent chain; print env block.
 *   validate — validate a chain (root-first JSON array of JWTs) on stdin.
 *   parse    — decode a UCAN JWT, print payload as JSON.
 *
 * Reads private keys from --key-hex (32-byte ed25519 seed).
 */
import { readFileSync } from 'node:fs';
import { sha256Hex } from '@auto-nomos/crypto';
import { issueUcan, parseUcanJwt, validateChain } from '@auto-nomos/ucan';

function usage(): void {
  process.stdout.write(`nomos-ucan — UCAN chain helper (Sprint MAOS-A)

Usage:
  nomos-ucan mint     --payload <file.json> --key-hex <hex>
  nomos-ucan fork     --parent-chain <file.json> --child-jwt <jwt>
                      [--max-depth N] [--parent-receipt-id ID] [--swarm-id ID]
  nomos-ucan validate --chain <file.json>
  nomos-ucan parse    --jwt <jwt>

Output:
  mint   → JSON {jwt, cid}
  fork   → JSON {chain, env: {NOMOS_PARENT_UCAN_CHAIN, ...}}
  parse  → JSON payload
  exit 0 on success, 1 on validation failure.
`);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function getArg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const [, , subcmd, ...rest] = process.argv;
  if (!subcmd || subcmd === '-h' || subcmd === '--help') {
    usage();
    process.exit(subcmd ? 0 : 2);
  }

  if (subcmd === 'mint') {
    const payloadPath = getArg(rest, '--payload');
    const keyHex = getArg(rest, '--key-hex');
    if (!payloadPath || !keyHex) {
      process.stderr.write('mint requires --payload and --key-hex\n');
      process.exit(2);
    }
    const payload = readJson<Record<string, unknown>>(payloadPath);
    const key = Uint8Array.from(Buffer.from(keyHex, 'hex'));
    const issued = issueUcan({
      payload: payload as unknown as Parameters<typeof issueUcan>[0]['payload'],
      privateKey: key,
    });
    process.stdout.write(`${JSON.stringify({ jwt: issued.jwt, cid: issued.cid })}\n`);
    return;
  }

  if (subcmd === 'fork') {
    const parentChainPath = getArg(rest, '--parent-chain');
    const childJwt = getArg(rest, '--child-jwt');
    if (!parentChainPath || !childJwt) {
      process.stderr.write('fork requires --parent-chain and --child-jwt\n');
      process.exit(2);
    }
    const parentChain = readJson<string[]>(parentChainPath);
    const maxDepth = Number(getArg(rest, '--max-depth') ?? '8');
    const chain = [...parentChain, childJwt];
    if (chain.length > maxDepth) {
      process.stderr.write(`fork: chain depth ${chain.length} exceeds max ${maxDepth}\n`);
      process.exit(1);
    }
    const env: Record<string, string> = {
      NOMOS_PARENT_UCAN_CHAIN: JSON.stringify(chain),
    };
    const parentReceipt = getArg(rest, '--parent-receipt-id');
    if (parentReceipt) env.NOMOS_PARENT_RECEIPT_ID = parentReceipt;
    const swarm = getArg(rest, '--swarm-id');
    if (swarm) env.NOMOS_SWARM_ID = swarm;
    process.stdout.write(`${JSON.stringify({ chain, env })}\n`);
    return;
  }

  if (subcmd === 'validate') {
    const chainPath = getArg(rest, '--chain');
    if (!chainPath) {
      process.stderr.write('validate requires --chain\n');
      process.exit(2);
    }
    const chain = readJson<string[]>(chainPath);
    const result = validateChain(chain);
    if (result.valid) {
      process.stdout.write(
        `${JSON.stringify({
          ok: true,
          depth: chain.length - 1,
          rootIss: result.root.iss,
          leafAud: result.leaf.aud,
        })}\n`,
      );
      return;
    }
    process.stderr.write(`${JSON.stringify({ ok: false, error: result.error })}\n`);
    process.exit(1);
  }

  if (subcmd === 'parse') {
    const jwt = getArg(rest, '--jwt');
    if (!jwt) {
      process.stderr.write('parse requires --jwt\n');
      process.exit(2);
      return;
    }
    const parsed = parseUcanJwt(jwt);
    if ('error' in parsed) {
      process.stderr.write(`${JSON.stringify({ ok: false, error: parsed.error })}\n`);
      process.exit(1);
      return;
    }
    const cid = sha256Hex(jwt);
    process.stdout.write(
      `${JSON.stringify({ ok: true, cid, payload: parsed.payload, header: parsed.header })}\n`,
    );
    return;
  }

  process.stderr.write(`unknown subcommand: ${subcmd}\n`);
  usage();
  process.exit(2);
}

void main();
