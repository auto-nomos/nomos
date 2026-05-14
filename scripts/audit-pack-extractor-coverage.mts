#!/usr/bin/env tsx
/**
 * Build-time invariant: every schema-pack with a non-empty `actions` list
 * must export an `extractResourceFromApiCall`. Without it the PDP's
 * `validateResourceConsistency` falls through and the apiCall-smuggle /
 * resource_mismatch gates are silently disabled for that provider.
 *
 * Wire into CI alongside `pack-smoke.mts`. Exit code 1 = at least one
 * pack is missing its extractor.
 *
 * Run:
 *   pnpm tsx scripts/audit-pack-extractor-coverage.mts
 */
import { PACKS } from '@auto-nomos/schema-packs';

/**
 * Packs enforced by something other than the HTTP proxy (e.g. filesystem
 * is gated by the local adapter executor). They legitimately have no
 * `extractResourceFromApiCall` since `validateResourceConsistency` is
 * never called for them.
 */
const NON_PROXY_PACKS = new Set<string>(['filesystem']);

function main(): void {
  const missing: string[] = [];
  for (const pack of PACKS) {
    if (pack.actions.length === 0) continue;
    if (NON_PROXY_PACKS.has(pack.id)) continue;
    if (typeof pack.extractResourceFromApiCall !== 'function') {
      missing.push(pack.id);
    }
  }
  if (missing.length === 0) {
    console.log(`extractor coverage OK — ${PACKS.length} packs scanned`);
    return;
  }
  console.error(
    `extractor coverage FAILED — ${missing.length} pack(s) missing extractResourceFromApiCall:`,
  );
  for (const id of missing) console.error(`  - ${id}`);
  console.error(
    '\nWithout an extractor, validateResourceConsistency falls through for these packs',
  );
  console.error('and the PDP cannot detect apiCall-smuggle / resource_mismatch attacks.');
  process.exit(1);
}

main();
