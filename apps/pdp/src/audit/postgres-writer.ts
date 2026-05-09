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
        //          resource, context, prev_hash, hash, payload.
        // ts is bigint epoch ms in the AuditEvent type but the column is timestamptz —
        // convert via to_timestamp(ms / 1000.0).
        placeholders.push(
          `($${i++}, $${i++}, to_timestamp($${i++}::bigint / 1000.0), $${i++}, $${i++}::audit_decision, $${i++}, $${i++}::jsonb, $${i++}::jsonb, $${i++}, $${i++}, $${i++}::jsonb)`,
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
        );
      }
      await pool.query(
        `INSERT INTO audit_events
          (event_id, customer_id, ts, agent, decision, command, resource, context, prev_hash, hash, payload)
         VALUES ${placeholders.join(', ')}`,
        params,
      );
    },
  };
}
