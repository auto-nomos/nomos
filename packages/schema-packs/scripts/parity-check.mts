#!/usr/bin/env tsx
/**
 * Schema-pack ↔ adapter YAML ↔ MCP tool parity check.
 *
 * Exits non-zero when any of the following invariants are violated:
 *
 *   1. Every action.id in packages/adapters/spec/<pack>.yaml has an entry
 *      in `<pack>/actions.ts.actionToCommand`.
 *   2. Every value of `actionToCommand` is present in `pack.actions`
 *      (templates.ts.actions array).
 *   3. Every command in `pack.actions` has an `apiCallSchema` after the
 *      merge of generated + hand-curated (so `validateApiCall` never
 *      fail-closed-misses on a declared write).
 *   4. Every YAML adapter id we expect to have a pack has a pack entry in
 *      PACK_TO_ADAPTER (catches future YAMLs that should but don't have a
 *      schema-pack equivalent).
 *
 * Run with: pnpm -F @auto-nomos/schema-packs parity
 */
import { loadAllAdapters } from '@auto-nomos/adapters';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACKS } from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');

const PACK_TO_ADAPTER: Record<string, string> = {
  github: 'github',
  slack: 'slack',
  notion: 'notion',
  linear: 'linear',
  stripe: 'stripe',
  discord: 'discord',
  google: 'google_drive',
  google_calendar: 'google_calendar',
  google_gmail: 'google_gmail',
  google_docs: 'google_docs',
  google_sheets: 'google_sheets',
  google_tasks: 'google_tasks',
  filesystem: 'filesystem',
  ssh: 'ssh',
};

/**
 * YAML adapters we ship in `packages/adapters/spec/` but DON'T expect a
 * schema-pack for (yet). Add an id here to silence parity for an adapter
 * whose schema-pack is intentionally deferred; remove from this list when
 * the pack lands.
 */
const PACKLESS_ADAPTERS = new Set<string>([
  'dropbox',
  'google_contacts',
  'granola',
  'imessage',
  'jira',
  'perplexity',
  'postgres',
  'salesforce',
  'telegram',
  'twilio',
]);

/**
 * Commands listed in a pack's `actions` array but with no corresponding
 * YAML adapter action (so the codegen can't emit an apiCallSchema for
 * them). These are pre-existing policy-only commands; the PDP fail-closes
 * on them at runtime (validateApiCall returns `schema_missing`) which is
 * the correct behaviour — they can be authored in Cedar policy but cannot
 * be called via `/v1/proxy` until backing YAML lands. Each line needs a
 * follow-up: add YAML or drop from pack.actions.
 *
 * Do NOT use this list to silence freshly-introduced orphans — fix them
 * properly (extend the YAML or change the command name to match).
 */
const KNOWN_ORPHAN_COMMANDS = new Set<string>([
]);

interface Problem {
  pack: string;
  msg: string;
}

async function main(): Promise<void> {
  const problems: Problem[] = [];
  const adapters = loadAllAdapters();

  for (const [packId, adapterId] of Object.entries(PACK_TO_ADAPTER)) {
    const adapter = adapters.get(adapterId);
    if (!adapter) {
      problems.push({ pack: packId, msg: `adapter ${adapterId}.yaml not found` });
      continue;
    }

    const mod = await import(resolve(PKG_ROOT, 'src', packId, 'actions.ts'));
    const actionToCommand: Record<string, string> = mod.actionToCommand ?? {};
    const pack = PACKS.find((p) => p.id === packId);
    if (!pack) {
      problems.push({ pack: packId, msg: `pack not exported from src/index.ts PACKS` });
      continue;
    }
    const packActions = new Set<string>(pack.actions);
    const schemas = pack.actionSchemas ?? {};

    // (1) every YAML action.id must have an actionToCommand entry.
    for (const action of adapter.actions) {
      if (!actionToCommand[action.id]) {
        problems.push({
          pack: packId,
          msg: `YAML action \`${action.id}\` has no actionToCommand entry`,
        });
      }
    }

    // (2) every actionToCommand value must be in pack.actions.
    for (const [id, command] of Object.entries(actionToCommand)) {
      if (!packActions.has(command)) {
        problems.push({
          pack: packId,
          msg: `actionToCommand[\`${id}\`] = \`${command}\` but not in pack.actions`,
        });
      }
    }

    // (3) every command in pack.actions must have an apiCallSchema unless
    //     allowlisted as a pre-existing orphan (policy-only command).
    for (const command of pack.actions) {
      if (!schemas[command]?.apiCallSchema && !KNOWN_ORPHAN_COMMANDS.has(command)) {
        problems.push({
          pack: packId,
          msg: `pack.actions has \`${command}\` but no apiCallSchema (regenerate with: pnpm gen:schemas, or add to KNOWN_ORPHAN_COMMANDS with a follow-up TODO)`,
        });
      }
    }
  }

  // (4) every YAML adapter must either map to a pack or be in PACKLESS_ADAPTERS.
  for (const adapterId of adapters.keys()) {
    const isMapped = Object.values(PACK_TO_ADAPTER).includes(adapterId);
    const isPackless = PACKLESS_ADAPTERS.has(adapterId);
    if (!isMapped && !isPackless) {
      problems.push({
        pack: '<global>',
        msg: `adapter \`${adapterId}.yaml\` has no schema-pack and is not in PACKLESS_ADAPTERS — add a pack or list as packless`,
      });
    }
  }

  if (problems.length === 0) {
    const totalActions = Array.from(adapters.values()).reduce((n, a) => n + a.actions.length, 0);
    console.log(
      `parity OK — ${Object.keys(PACK_TO_ADAPTER).length} packs, ${adapters.size} YAML adapters, ${totalActions} actions, ${PACKS.reduce((n, p) => n + p.actions.length, 0)} commands.`,
    );
    return;
  }
  console.error(`parity FAILED — ${problems.length} problem(s):`);
  for (const p of problems) {
    console.error(`  [${p.pack}] ${p.msg}`);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
