import type pg from 'pg';
import type { AuditRow, PostgresAuditWriter } from './postgres-emitter.js';

/**
 * Concrete writer that bulk-inserts audit rows into the control plane's
 * `audit_events` table. PDP and control plane both reach the same Postgres
 * (Neon in prod, docker postgres in dev).
 */
export function createPgAuditWriter(pool: pg.Pool): PostgresAuditWriter {
  return {
    async fetchLastHash(customerId) {
      const r = await pool.query<{ hash: string }>(
        'SELECT hash FROM audit_events WHERE customer_id = $1 ORDER BY ts DESC LIMIT 1',
        [customerId],
      );
      return r.rows[0]?.hash;
    },
    async insertBatch(rows: AuditRow[]) {
      if (rows.length === 0) return;
      const placeholders: string[] = [];
      const params: unknown[] = [];
      let i = 1;
      for (const row of rows) {
        // Columns: event_id, customer_id, ts, agent, decision, command,
        //          resource, context, prev_hash, hash, payload,
        //          parent_receipt_id, swarm_id, chain_depth (Sprint MAOS-A),
        //          receipt_id (Sprint obs-v2 — sha256 hex; nullable).
        placeholders.push(
          `($${i++}, $${i++}, to_timestamp($${i++}::bigint / 1000.0), $${i++}, $${i++}::audit_decision, $${i++}, $${i++}::jsonb, $${i++}::jsonb, $${i++}, $${i++}, $${i++}::jsonb, $${i++}, $${i++}, $${i++}, $${i++})`,
        );
        params.push(
          row.event_id,
          row.customer_id,
          row.ts,
          row.agent,
          row.decision,
          row.command,
          JSON.stringify(row.resource),
          JSON.stringify(row.context),
          row.prev_hash,
          row.hash,
          JSON.stringify(row.payload),
          row.parent_receipt_id ?? null,
          row.swarm_id ?? null,
          row.chain_depth ?? null,
          row.receipt_id ?? null,
        );
      }
      await pool.query(
        `INSERT INTO audit_events
          (event_id, customer_id, ts, agent, decision, command, resource, context, prev_hash, hash, payload, parent_receipt_id, swarm_id, chain_depth, receipt_id)
         VALUES ${placeholders.join(', ')}`,
        params,
      );
    },
  };
}
