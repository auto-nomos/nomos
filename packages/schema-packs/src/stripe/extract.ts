import { parseStripePath } from './path.js';

/**
 * Derive effective resource keys for a stripe proxy call. Compared by
 * `validateResourceConsistency` against the agent-declared resource.
 *
 * For mutating endpoints the customer may also live in `body.customer`
 * (e.g. `POST /payment_intents` with `customer=cus_X`); we surface that
 * to keep the smuggle gate honest. Body may arrive form-encoded as a
 * string — caller normalises before invoking us.
 */
export function extractResourceFromApiCall(
  _command: string,
  apiCall: { method: string; path: string; body?: unknown; query?: Record<string, string> },
): Record<string, unknown> | null {
  const parsed = parseStripePath(apiCall.path);
  if (!parsed) return null;
  const out: Record<string, unknown> = {};
  if (parsed.customer_id) out.customer_id = parsed.customer_id;
  if (parsed.payment_intent) out.payment_intent = parsed.payment_intent;
  if (parsed.charge_id) out.charge_id = parsed.charge_id;
  if (parsed.subscription_id) out.subscription_id = parsed.subscription_id;
  if (parsed.invoice_id) out.invoice_id = parsed.invoice_id;

  const body = apiCall.body;
  const bodyObj =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : undefined;
  if (bodyObj) {
    if (out.customer_id === undefined && typeof bodyObj.customer === 'string') {
      out.customer_id = bodyObj.customer;
    }
    if (out.payment_intent === undefined && typeof bodyObj.payment_intent === 'string') {
      out.payment_intent = bodyObj.payment_intent;
    }
    if (out.charge_id === undefined && typeof bodyObj.charge === 'string') {
      out.charge_id = bodyObj.charge;
    }
  }

  return Object.keys(out).length === 0 ? null : out;
}
