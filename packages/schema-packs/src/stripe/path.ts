/**
 * Parse a stripe API path into its target object identifiers. Stripe paths
 * are id-based: `/customers/cus_X`, `/payment_intents/pi_X/capture`, etc.
 * Note: the api_base is `https://api.stripe.com/v1`, so the path that
 * arrives at the PDP proxy lacks the `/v1` prefix.
 *
 * Returns null when the leading segment isn't a recognised stripe object
 * namespace — the PDP rejects such calls when a stripe constraint is in
 * effect.
 */
export type StripePathInfo = {
  namespace?: string;
  customer_id?: string;
  payment_intent?: string;
  charge_id?: string;
  subscription_id?: string;
  invoice_id?: string;
  refund_id?: string;
  dispute_id?: string;
  product_id?: string;
  price_id?: string;
  balance_transaction_id?: string;
  action?: string;
};

const NAMESPACES = new Set([
  'customers',
  'payment_intents',
  'charges',
  'subscriptions',
  'invoices',
  'refunds',
  'disputes',
  'products',
  'prices',
  'balance_transactions',
  'setup_intents',
]);

const NAMESPACE_ID_KEY: Record<string, keyof StripePathInfo> = {
  customers: 'customer_id',
  payment_intents: 'payment_intent',
  charges: 'charge_id',
  subscriptions: 'subscription_id',
  invoices: 'invoice_id',
  refunds: 'refund_id',
  disputes: 'dispute_id',
  products: 'product_id',
  prices: 'price_id',
  balance_transactions: 'balance_transaction_id',
};

export function parseStripePath(path: string): StripePathInfo | null {
  if (!path.startsWith('/')) return null;
  const head = path.split('?')[0]!;
  const segs = head.split('/').filter(Boolean);
  if (segs.length === 0) return null;
  const namespace = segs[0]!;
  if (!NAMESPACES.has(namespace)) return null;
  const out: StripePathInfo = { namespace };
  if (segs[1]) {
    const idKey = NAMESPACE_ID_KEY[namespace];
    if (idKey) (out as Record<string, unknown>)[idKey] = segs[1];
  }
  if (segs[2]) out.action = segs[2];
  return out;
}
