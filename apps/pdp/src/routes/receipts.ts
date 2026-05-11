import { ReceiptInput as ReceiptInputSchema } from '@auto-nomos/shared-types';
import { Hono } from 'hono';
import { getLog } from '../middleware/logger.js';

export interface ReceiptEmitInput {
  customerId: string;
  receiptId: string;
  ts: number;
  outcome: 'success' | 'failure';
  metadata?: Record<string, unknown>;
}

export interface ReceiptRouteDeps {
  emitReceipt?: (event: ReceiptEmitInput) => Promise<void> | void;
}

const CUSTOMER_HEADER = 'x-cb-customer';

export function createReceiptRoutes(deps: ReceiptRouteDeps): Hono {
  const app = new Hono();

  app.post('/v1/receipts', async (c) => {
    if (!deps.emitReceipt) {
      return c.json({ error: 'receipts not configured' }, 503);
    }

    const customerId = c.req.header(CUSTOMER_HEADER);
    if (!customerId) {
      return c.json({ error: 'missing x-cb-customer header' }, 400);
    }

    const body = await c.req.json().catch(() => null);
    if (!body) {
      return c.json({ error: 'invalid JSON body' }, 400);
    }

    const parsed = ReceiptInputSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'invalid request shape', issues: parsed.error.issues }, 400);
    }

    const ts = Date.now();
    await deps.emitReceipt({
      customerId,
      receiptId: parsed.data.receiptId,
      ts,
      outcome: parsed.data.outcome,
      ...(parsed.data.metadata !== undefined ? { metadata: parsed.data.metadata } : {}),
    });

    getLog(c).info(
      { customerId, receiptId: parsed.data.receiptId, outcome: parsed.data.outcome },
      'receipt',
    );
    return c.json({ ok: true }, 200);
  });

  return app;
}
