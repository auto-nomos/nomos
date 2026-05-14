/**
 * Stripe data-plane gate. Re-derives the target object id from
 * `apiCall.path` (and `body.customer` for endpoints that take a free
 * customer arg) and rejects calls outside the `StripeConstraint`.
 *
 * Stripe bodies arrive form-encoded as a string OR as an object,
 * depending on how the caller assembled them. We normalise both.
 */
import { parseStripePath } from '@auto-nomos/schema-packs/stripe/path';
import type { StripeConstraint } from '@auto-nomos/shared-types';

export type StripeAdapterFailure =
  | 'customer_mismatch'
  | 'payment_intent_mismatch'
  | 'charge_mismatch'
  | 'subscription_mismatch'
  | 'invoice_mismatch'
  | 'account_mismatch'
  | 'path_outside_constraint'
  | 'unparseable_path';

export type StripeAdapterResult = { ok: true } | { ok: false; reason: StripeAdapterFailure };

export interface StripeProxyCall {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
}

function normaliseBody(body: unknown): Record<string, unknown> | undefined {
  if (!body) return undefined;
  if (typeof body === 'string') {
    const params = new URLSearchParams(body);
    const out: Record<string, unknown> = {};
    for (const [k, v] of params) out[k] = v;
    return out;
  }
  if (typeof body === 'object' && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return undefined;
}

export function validateStripeProxyCall(
  constraint: StripeConstraint,
  apiCall: StripeProxyCall,
): StripeAdapterResult {
  const parsed = parseStripePath(apiCall.path);
  if (!parsed) return { ok: false, reason: 'unparseable_path' };
  if (constraint.path_prefix !== undefined && !apiCall.path.startsWith(constraint.path_prefix)) {
    return { ok: false, reason: 'path_outside_constraint' };
  }
  const body = normaliseBody(apiCall.body);
  const effCustomer =
    parsed.customer_id ?? (typeof body?.customer === 'string' ? body.customer : undefined);
  if (constraint.customer_id !== undefined && effCustomer !== constraint.customer_id) {
    return { ok: false, reason: 'customer_mismatch' };
  }
  if (
    constraint.payment_intent !== undefined &&
    parsed.payment_intent !== constraint.payment_intent
  ) {
    return { ok: false, reason: 'payment_intent_mismatch' };
  }
  if (constraint.charge_id !== undefined && parsed.charge_id !== constraint.charge_id) {
    return { ok: false, reason: 'charge_mismatch' };
  }
  if (
    constraint.subscription_id !== undefined &&
    parsed.subscription_id !== constraint.subscription_id
  ) {
    return { ok: false, reason: 'subscription_mismatch' };
  }
  if (constraint.invoice_id !== undefined && parsed.invoice_id !== constraint.invoice_id) {
    return { ok: false, reason: 'invoice_mismatch' };
  }
  if (constraint.account_id !== undefined) {
    const stripeAccount =
      apiCall.headers?.['stripe-account'] ?? apiCall.headers?.['Stripe-Account'];
    if (stripeAccount !== constraint.account_id) {
      return { ok: false, reason: 'account_mismatch' };
    }
  }
  return { ok: true };
}
