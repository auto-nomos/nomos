/**
 * POST /v1/spans — MCP-server ↔ control-plane.
 *
 * Records what an agent actually *did* with an authorized capability:
 * upstream HTTP status, latency, hashes of payloads, and a tiny allowlisted
 * summary. Never raw bodies. See packages/shared-types/src/spans.ts for the
 * envelope and packages/mcp-server/src/spans.ts for the emitter that calls
 * this.
 *
 * Idempotent on (customer_id, receipt_id) — fire-and-forget retries from the
 * SDK don't double-write.
 */
import { EmitSpanInputSchema } from '@auto-nomos/shared-types';
import { Hono } from 'hono';
import type { Db } from '../db/index.js';
import { type ApiKeyAuthVariables, apiKeyAuth } from '../middleware/api-key-auth.js';
import { getLog } from '../middleware/logger.js';
import { ingestSpan, SpanIngestError } from '../services/spans.js';

export interface SpansRouteDeps {
  db: Db;
}

export function createSpansRoutes(deps: SpansRouteDeps): Hono<{ Variables: ApiKeyAuthVariables }> {
  const app = new Hono<{ Variables: ApiKeyAuthVariables }>();

  app.post('/v1/spans', apiKeyAuth({ db: deps.db }), async (c) => {
    const log = getLog(c);
    const customerId = c.get('customerId');
    const agentId = c.get('agentId');

    const raw = await c.req.json().catch(() => null);
    if (!raw) {
      return c.json({ error: 'invalid JSON body', error_code: 'invalid_body' }, 400);
    }
    const parsed = EmitSpanInputSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        { error: 'invalid request', error_code: 'invalid_body', issues: parsed.error.issues },
        400,
      );
    }

    try {
      const result = await ingestSpan({ customerId, agentId, input: parsed.data }, deps.db);
      log.info(
        {
          customerId,
          agentId,
          spanId: result.spanId,
          inserted: result.inserted,
          receiptId: parsed.data.receiptId,
          status: parsed.data.status,
          tool: parsed.data.toolName,
          latencyMs: parsed.data.latencyMs,
        },
        'span ingest',
      );
      return c.json({
        spanId: result.spanId,
        inserted: result.inserted,
        swarmId: result.swarmId,
      });
    } catch (err) {
      if (err instanceof SpanIngestError) {
        const status =
          err.code === 'receipt_not_found'
            ? 404
            : err.code === 'receipt_wrong_tenant' || err.code === 'agent_mismatch'
              ? 403
              : 400;
        return c.json({ error: err.message, error_code: err.code }, status);
      }
      throw err;
    }
  });

  return app;
}
