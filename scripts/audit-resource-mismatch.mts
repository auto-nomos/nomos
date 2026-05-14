#!/usr/bin/env tsx
/**
 * One-shot historical scan for the 2026-05-14 resource_mismatch class.
 *
 * Looks for rows where the agent-declared `request.resource` names a
 * different github repo than the upstream `apiCall.path` actually hit
 * (Probe-14: declared = octocat/Hello-World, apiCall = admin/test-repo).
 *
 * Read-only. Uses DATABASE_URL from the environment. Run once locally
 * against prod DSN; print receipt ids + customer + ts so the operator
 * can correlate with their incident timeline.
 *
 * Two passes:
 *   1) For rows written after migration 0027 — read structured
 *      `api_call_path` column.
 *   2) For older rows — read `payload->'apiCall'->>'path'`.
 *
 * Exits 0 even with hits; this is surveying, not enforcement.
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
  declared_owner: string | null;
  declared_repo: string | null;
  effective_path: string;
}

async function main(): Promise<void> {
  const dsn = process.env.DATABASE_URL;
  if (!dsn) {
    console.error('DATABASE_URL env var required');
    process.exit(2);
  }

  const pool = new pg.Pool({ connectionString: dsn });
  try {
    // Pass 1 — structured columns (post 0027 rows).
    const r1 = await pool.query<Hit>(
      `SELECT
         ts::text                                              AS occurred_at,
         customer_id::text                                     AS customer_id,
         agent                                                 AS agent,
         receipt_id,
         command,
         resource->>'owner'                                    AS declared_owner,
         resource->>'repo_name'                                AS declared_repo,
         api_call_path                                         AS effective_path
       FROM audit_events
       WHERE command LIKE '/github/%'
         AND api_call_path IS NOT NULL
         AND resource->>'owner' IS NOT NULL
         AND api_call_path !~ ('^/repos/' || (resource->>'owner') || '/')
       ORDER BY ts`,
    );

    // Pass 2 — legacy rows where apiCall lived only in payload jsonb.
    const r2 = await pool.query<Hit>(
      `SELECT
         ts::text                                              AS occurred_at,
         customer_id::text                                     AS customer_id,
         agent                                                 AS agent,
         receipt_id,
         command,
         payload->'request'->'resource'->>'owner'              AS declared_owner,
         payload->'request'->'resource'->>'repo_name'          AS declared_repo,
         (payload->'apiCall'->>'path')                         AS effective_path
       FROM audit_events
       WHERE command LIKE '/github/%'
         AND api_call_path IS NULL
         AND payload->'apiCall'->>'path' IS NOT NULL
         AND payload->'request'->'resource'->>'owner' IS NOT NULL
         AND (payload->'apiCall'->>'path') !~
             ('^/repos/' || (payload->'request'->'resource'->>'owner') || '/')
       ORDER BY ts`,
    );

    const hits = [...r1.rows, ...r2.rows];
    if (hits.length === 0) {
      console.log('no resource_mismatch hits in audit_events');
      return;
    }
    console.log(`found ${hits.length} resource_mismatch row(s):`);
    for (const h of hits) {
      console.log(
        `  ${h.occurred_at}  cust=${h.customer_id}  cmd=${h.command}  receipt=${h.receipt_id ?? '-'}`,
      );
      console.log(`    declared: ${h.declared_owner}/${h.declared_repo ?? '?'}`);
      console.log(`    effective: ${h.effective_path}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
