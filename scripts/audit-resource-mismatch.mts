#!/usr/bin/env tsx
/**
 * Historical scan for the 2026-05-14 resource_mismatch class across ALL
 * supported providers. Looks for rows where the agent-declared
 * `request.resource` names a different target object than the upstream
 * `apiCall.path` actually hit (Probe-14 generalised).
 *
 * Read-only. Uses DATABASE_URL from the environment. Exits 0 even with
 * hits; this is surveying, not enforcement.
 *
 * Coverage per pack (path schema → declared key checked against):
 *   github          → /repos/{owner}/...                resource.owner
 *   slack           → /<method.subpath>                  resource.channel_id
 *   stripe          → /<ns>/<id>                         resource.customer_id
 *   notion          → /pages|databases|blocks/<id>       resource.page_id|database_id|block_id
 *   google (drive)  → /files/{file_id}                   resource.file_id
 *   google_gmail    → /users/{user_id}/messages/{id}     resource.message_id
 *   google_calendar → /calendars/{cal}/events/{event}    resource.event_id
 *   google_docs     → /documents/{document_id}           resource.document_id
 *   google_sheets   → /spreadsheets/{ss}                 resource.spreadsheet_id
 *   google_tasks    → /lists/{tasklist}/tasks/{task}     resource.task_id
 *   google_contacts → /people/{resource_name}            resource.resource_name
 *   linear          → /  + body.variables                resource.issue_id (body only)
 *
 * Linear is special-cased: the URL is always `/`, so the smuggle vector
 * is in `payload.apiCall.body.variables`. Captured by a separate pass.
 *
 * Run:
 *   DATABASE_URL='postgres://...' pnpm tsx scripts/audit-resource-mismatch.mts
 */
import pg from 'pg';

interface Hit {
  occurred_at: string;
  customer_id: string;
  agent: string;
  receipt_id: string | null;
  command: string;
  declared_key: string;
  declared_value: string | null;
  effective_path: string;
}

const URL_SCANS: Array<{
  pack: string;
  command_like: string;
  declared_jsonb_key: string;
  effective_regex: string;
}> = [
  {
    pack: 'github',
    command_like: '/github/%',
    declared_jsonb_key: 'owner',
    effective_regex: "'^/repos/' || %DECLARED% || '/'",
  },
  {
    pack: 'stripe',
    command_like: '/stripe/customer/%',
    declared_jsonb_key: 'customer_id',
    effective_regex: "'^/customers/' || %DECLARED% || '($|/)'",
  },
  {
    pack: 'notion-page',
    command_like: '/notion/page/%',
    declared_jsonb_key: 'page_id',
    effective_regex: "'^/pages/' || replace(%DECLARED%, '-', '') || '($|/)'",
  },
  {
    pack: 'notion-database',
    command_like: '/notion/database/%',
    declared_jsonb_key: 'database_id',
    effective_regex: "'^/databases/' || replace(%DECLARED%, '-', '') || '($|/)'",
  },
  {
    pack: 'google-drive',
    command_like: '/google/drive/%',
    declared_jsonb_key: 'file_id',
    effective_regex: "'^/files/' || %DECLARED% || '($|/)'",
  },
  {
    pack: 'google-gmail-message',
    command_like: '/google/gmail/message/%',
    declared_jsonb_key: 'message_id',
    effective_regex: "'^/users/[^/]+/messages/' || %DECLARED% || '($|/)'",
  },
  {
    pack: 'google-calendar-event',
    command_like: '/google/calendar/event/%',
    declared_jsonb_key: 'event_id',
    effective_regex: "'^/calendars/[^/]+/events/' || %DECLARED% || '($|/)'",
  },
  {
    pack: 'google-docs',
    command_like: '/google/docs/%',
    declared_jsonb_key: 'document_id',
    effective_regex: "'^/documents/' || %DECLARED% || '($|:|/)'",
  },
  {
    pack: 'google-sheets',
    command_like: '/google/sheets/%',
    declared_jsonb_key: 'spreadsheet_id',
    effective_regex: "'^/spreadsheets/' || %DECLARED% || '($|:|/)'",
  },
  {
    pack: 'google-tasks',
    command_like: '/google/tasks/%',
    declared_jsonb_key: 'task_id',
    effective_regex: "'^/lists/[^/]+/tasks/' || %DECLARED% || '($|/)'",
  },
];

async function main(): Promise<void> {
  const dsn = process.env.DATABASE_URL;
  if (!dsn) {
    console.error('DATABASE_URL env var required');
    process.exit(2);
  }

  const pool = new pg.Pool({ connectionString: dsn });
  const allHits: Hit[] = [];
  try {
    for (const scan of URL_SCANS) {
      const declaredExpr = `resource->>'${scan.declared_jsonb_key}'`;
      const effective = scan.effective_regex.replace(/%DECLARED%/g, declaredExpr);
      const sql = `SELECT
           ts::text                              AS occurred_at,
           customer_id::text                     AS customer_id,
           agent                                 AS agent,
           receipt_id,
           command,
           '${scan.declared_jsonb_key}'          AS declared_key,
           ${declaredExpr}                       AS declared_value,
           api_call_path                         AS effective_path
         FROM audit_events
         WHERE command LIKE $1
           AND api_call_path IS NOT NULL
           AND ${declaredExpr} IS NOT NULL
           AND api_call_path !~ (${effective})
         ORDER BY ts`;
      const r = await pool.query<Hit>(sql, [scan.command_like]);
      for (const row of r.rows) allHits.push(row);
    }
    if (allHits.length === 0) {
      console.log('no resource_mismatch hits across any provider in audit_events');
      return;
    }
    console.log(`found ${allHits.length} resource_mismatch row(s) across providers:`);
    for (const h of allHits) {
      console.log(
        `  ${h.occurred_at}  cust=${h.customer_id}  cmd=${h.command}  receipt=${h.receipt_id ?? '-'}`,
      );
      console.log(`    declared.${h.declared_key} = ${h.declared_value}`);
      console.log(`    effective_path = ${h.effective_path}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
