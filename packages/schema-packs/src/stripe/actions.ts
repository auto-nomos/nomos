/**
 * Mapping from `packages/adapters/spec/stripe.yaml` action ids to canonical
 * Cedar commands.
 */

export const actionToCommand: Record<string, string> = {
  list_customers: '/stripe/customer/list',
  get_customer: '/stripe/customer/read',
  create_customer: '/stripe/customer/create',
  update_customer: '/stripe/customer/update',
  create_refund: '/stripe/refund/create',
  list_subscriptions: '/stripe/subscription/list',
  cancel_subscription: '/stripe/subscription/cancel',
  create_subscription: '/stripe/subscription/create',
  update_subscription: '/stripe/subscription/update',
  get_subscription: '/stripe/subscription/read',
  list_charges: '/stripe/charge/list',
  get_charge: '/stripe/charge/read',
  list_invoices: '/stripe/invoice/list',
  get_invoice: '/stripe/invoice/read',
  list_payment_intents: '/stripe/payment_intent/list',
  get_payment_intent: '/stripe/payment_intent/read',
  create_payment_intent: '/stripe/payment_intent/create',
  capture_payment_intent: '/stripe/payment_intent/capture',
  cancel_payment_intent: '/stripe/payment_intent/cancel',
  list_products: '/stripe/product/list',
  list_prices: '/stripe/price/list',
  list_disputes: '/stripe/dispute/list',
  list_balance_transactions: '/stripe/balance_transaction/list',
  get_balance: '/stripe/balance/read',
  list_setup_intents: '/stripe/setup_intent/list',
  list_refunds: '/stripe/refund/list',
};

export function resourceFor(
  actionId: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const customerId =
    typeof params.customer_id === 'string'
      ? params.customer_id
      : typeof params.customer === 'string'
        ? params.customer
        : undefined;
  const chargeId = typeof params.charge_id === 'string' ? params.charge_id : undefined;
  const invoiceId = typeof params.invoice_id === 'string' ? params.invoice_id : undefined;
  const subscriptionId =
    typeof params.subscription_id === 'string' ? params.subscription_id : undefined;
  const piId = typeof params.payment_intent_id === 'string' ? params.payment_intent_id : undefined;

  switch (actionId) {
    case 'list_customers':
    case 'list_charges':
    case 'list_invoices':
    case 'list_payment_intents':
    case 'list_subscriptions':
    case 'create_customer':
    case 'create_refund':
    case 'create_payment_intent':
    case 'create_subscription':
    case 'list_products':
    case 'list_prices':
    case 'list_disputes':
    case 'list_balance_transactions':
    case 'get_balance':
    case 'list_setup_intents':
    case 'list_refunds':
      return {};
    case 'get_customer':
    case 'update_customer':
      return customerId ? { customer: customerId } : {};
    case 'get_charge':
      return chargeId ? { charge: chargeId } : {};
    case 'get_invoice':
      return invoiceId ? { invoice: invoiceId } : {};
    case 'get_subscription':
    case 'cancel_subscription':
    case 'update_subscription':
      return subscriptionId ? { subscription: subscriptionId } : {};
    case 'get_payment_intent':
    case 'capture_payment_intent':
    case 'cancel_payment_intent':
      return piId ? { payment_intent: piId } : {};
    default:
      return {};
  }
}
