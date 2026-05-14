#!/usr/bin/env tsx
/**
 * Historical scan for the apiCall-smuggle vector, generalised to every
 * shipping schema-pack.
 *
 * Originally landed 2026-05-14 as a one-shot github-only scan after the
 * apiCall-smuggle gap was closed; broadened 2026-05-14 (P-CV3 follow-up)
 * to cover slack/stripe/linear/notion + 7 google sub-services. The PDP
 * now refuses every cross-provider mismatch at request time
 * (validateResourceConsistency + per-provider validators), but this
 * script lets ops sweep historical `audit_events` rows for the same
 * pattern across all providers.
 *
 * For every write command in `packages/adapters/spec/*.yaml`, derives the
 * expected upstream path prefix from the action's HTTP template, then
 * queries `audit_events` for rows that match the command but whose
 * recorded `apiCall.path` does NOT match the expected prefix. Each such
 * row is a candidate command/endpoint smuggle.
 *
 * Read-only. Uses DATABASE_URL from the environment (set to the prod
 * pooled DSN to scan production, or your local docker DSN for a dry-run).
 *
 * Output: count + receipt id + timestamp + customer + recorded path for
 * each hit, grouped by command. Exits 0 even with hits — this is a
 * surveying script, not a blocker.
 *
 * Run:
 *   DATABASE_URL='postgres://...' pnpm tsx scripts/audit-content-update-smuggle.mts
 */
import { loadAllAdapters, type Action } from '@auto-nomos/adapters';
import { actionToCommand as githubMap } from '@auto-nomos/schema-packs/github';
import { actionToCommand as slackMap } from '@auto-nomos/schema-packs/slack';
import { actionToCommand as notionMap } from '@auto-nomos/schema-packs/notion';
import { actionToCommand as linearMap } from '@auto-nomos/schema-packs/linear';
import { actionToCommand as stripeMap } from '@auto-nomos/schema-packs/stripe';
import { actionToCommand as googleMap } from '@auto-nomos/schema-packs/google';
import { actionToCommand as googleCalendarMap } from '@auto-nomos/schema-packs/google_calendar';
import { actionToCommand as googleGmailMap } from '@auto-nomos/schema-packs/google_gmail';
import { actionToCommand as googleDocsMap } from '@auto-nomos/schema-packs/google_docs';
import { actionToCommand as googleSheetsMap } from '@auto-nomos/schema-packs/google_sheets';
import { actionToCommand as googleTasksMap } from '@auto-nomos/schema-packs/google_tasks';
import { actionToCommand as googleContactsMap } from '@auto-nomos/schema-packs/google_contacts';
import { actionToCommand as filesystemMap } from '@auto-nomos/schema-packs/filesystem';
import { actionToCommand as sshMap } from '@auto-nomos/schema-packs/ssh';
import pg from 'pg';

const PACK_TO_ADAPTER: Array<[string, Record<string, string>]> = [
  ['github', githubMap],
  ['slack', slackMap],
  ['notion', notionMap],
  ['linear', linearMap],
  ['stripe', stripeMap],
  ['google_drive', googleMap],
  ['google_calendar', googleCalendarMap],
  ['google_gmail', googleGmailMap],
  ['google_docs', googleDocsMap],
  ['google_sheets', googleSheetsMap],
  ['google_tasks', googleTasksMap],
  ['google_contacts', googleContactsMap],
  ['filesystem', filesystemMap],
  ['ssh', sshMap],
];

/**
 * Compute the SQL LIKE pattern an apiCall.path MUST match for `action`.
 * Replaces `{var}` with `%` and trims a trailing `/` to allow exact match.
 * Examples:
 *   /repos/{owner}/{repo}/contents/{path} → /repos/%/%/contents/%
 *   /user/repos                            → /user/repos
 *   /documents/{documentId}:batchUpdate    → /documents/%:batchUpdate
 */
function templateToLikePattern(tmpl: string): string {
  return tmpl.replace(/\{[a-zA-Z_][a-zA-Z0-9_]*\}/g, '%');
}

function isWrite(action: Action): boolean {
  return action.risk.category === 'write' || action.risk.category === 'delete';
}

interface Hit {
  command: string;
  eventId: string;
  occurredAt: string;
  customerId: string;
  recordedPath: string | null;
  recordedMethod: string | null;
  decision: string;
}

async function main(): Promise<void> {
  const dsn = process.env.DATABASE_URL;
  if (!dsn) {
    console.error('DATABASE_URL is required. Set to your prod or docker DSN.');
    process.exit(2);
  }
  const client = new pg.Client({ connectionString: dsn });
  await client.connect();
  try {
    const adapters = loadAllAdapters();
    const allHits: Hit[] = [];
    const checked: Array<{ command: string; expected: string; method: string }> = [];

    const sqlText = `
      SELECT
        event_id::text AS event_id,
        ts,
        customer_id::text AS customer_id,
        decision::text AS decision,
        COALESCE(
          payload->'apiCall'->>'path',
          payload->'request'->'apiCall'->>'path'
        ) AS recorded_path,
        COALESCE(
          payload->'apiCall'->>'method',
          payload->'request'->'apiCall'->>'method'
        ) AS recorded_method
      FROM audit_events
      WHERE command = $1
        AND COALESCE(
          payload->'apiCall'->>'path',
          payload->'request'->'apiCall'->>'path'
        ) IS NOT NULL
        AND (
          COALESCE(
            payload->'apiCall'->>'path',
            payload->'request'->'apiCall'->>'path'
          ) NOT LIKE $2
          OR COALESCE(
            payload->'apiCall'->>'method',
            payload->'request'->'apiCall'->>'method'
          ) <> $3
        )
      ORDER BY ts
    `;

    for (const [adapterId, mapping] of PACK_TO_ADAPTER) {
      const adapter = adapters.get(adapterId);
      if (!adapter) continue;
      for (const action of adapter.actions) {
        if (!isWrite(action)) continue;
        const command = mapping[action.id];
        if (!command) continue;
        const pattern = templateToLikePattern(action.http.path);
        checked.push({ command, expected: pattern, method: action.http.method });

        const result = await client.query<{
          event_id: string;
          ts: Date;
          customer_id: string;
          decision: string;
          recorded_path: string | null;
          recorded_method: string | null;
        }>(sqlText, [command, pattern, action.http.method]);

        for (const r of result.rows) {
          allHits.push({
            command,
            eventId: r.event_id,
            occurredAt: new Date(r.ts).toISOString(),
            customerId: r.customer_id,
            recordedPath: r.recorded_path,
            recordedMethod: r.recorded_method,
            decision: r.decision,
          });
        }
      }
    }

    console.log(
      `scanned ${checked.length} write commands across ${PACK_TO_ADAPTER.length} adapters`,
    );
    if (allHits.length === 0) {
      console.log('no smuggle-pattern hits found');
      return;
    }
    console.log(`\n${allHits.length} candidate smuggle event(s):\n`);
    const byCommand = new Map<string, Hit[]>();
    for (const h of allHits) {
      const arr = byCommand.get(h.command) ?? [];
      arr.push(h);
      byCommand.set(h.command, arr);
    }
    for (const [command, hits] of byCommand) {
      const tmpl = checked.find((c) => c.command === command);
      console.log(`# ${command}  (expected ${tmpl?.method ?? '?'} ${tmpl?.expected ?? '?'})`);
      for (const h of hits) {
        console.log(
          `  ${h.occurredAt}  customer=${h.customerId}  decision=${h.decision}  ${h.recordedMethod ?? '?'} ${h.recordedPath ?? '?'}  receipt=${h.eventId}`,
        );
      }
      console.log();
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
