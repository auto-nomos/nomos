import type { PolicyTemplate } from '../types.js';

/**
 * Stripe vocabulary. Read-class actions are safe defaults; mutating
 * actions (refund, send-invoice, charge-create) sit behind explicit
 * step-up templates because their blast radius is real money.
 */
export const READS = [
  '/stripe/customer/read',
  '/stripe/customer/list',
  '/stripe/charge/read',
  '/stripe/charge/list',
  '/stripe/invoice/read',
  '/stripe/invoice/list',
  '/stripe/subscription/read',
  '/stripe/subscription/list',
  '/stripe/payment_intent/read',
  '/stripe/payment_intent/list',
  '/stripe/product/list',
  '/stripe/price/list',
  '/stripe/dispute/list',
  '/stripe/balance_transaction/list',
  '/stripe/balance/read',
  '/stripe/setup_intent/list',
  '/stripe/refund/list',
] as const;
export const WRITES = [
  '/stripe/customer/create',
  '/stripe/customer/update',
  '/stripe/invoice/create',
  '/stripe/invoice/send',
  '/stripe/refund/create',
  '/stripe/subscription/cancel',
  '/stripe/subscription/create',
  '/stripe/subscription/update',
  '/stripe/payment_intent/create',
  '/stripe/payment_intent/capture',
  '/stripe/payment_intent/cancel',
] as const;
export const actions = [...READS, ...WRITES] as const;

const READ_LIST = READS.map((a) => `Action::"${a}"`).join(', ');

export const templates: PolicyTemplate[] = [
  {
    id: 'stripe:read-only',
    integrationId: 'stripe',
    name: 'Read-only',
    description: 'List + read customers, charges, invoices, subscriptions. No mutations.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'stripe:read-and-create-customer',
    integrationId: 'stripe',
    name: 'Read + create customer',
    description: 'Read everything; create new customer records, no other writes.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}, Action::"/stripe/customer/create"],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'stripe:step-up-refund',
    integrationId: 'stripe',
    name: 'Step-up for refund',
    description:
      'Read + create customer; refunds and invoice send require co-signer approval each call.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}, Action::"/stripe/customer/create"],\n  resource\n);\n\npermit (\n  principal,\n  action in [Action::"/stripe/charge/refund", Action::"/stripe/invoice/send"],\n  resource\n)\nwhen { context.cosigner == true };`,
    visualReady: true,
  },
  {
    id: 'stripe:invoicing-only',
    integrationId: 'stripe',
    name: 'Invoicing helper',
    description: 'Read + create + send invoices; never refund.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}, Action::"/stripe/invoice/create", Action::"/stripe/invoice/send"],\n  resource\n);`,
    visualReady: true,
  },
  {
    id: 'stripe:cancel-subscription-step-up',
    integrationId: 'stripe',
    name: 'Step-up to cancel subscription',
    description: 'Read freely; cancelling a subscription requires co-signer approval each call.',
    cedarText: `permit (\n  principal,\n  action in [${READ_LIST}],\n  resource\n);\n\npermit (\n  principal,\n  action == Action::"/stripe/subscription/cancel",\n  resource\n)\nwhen { context.cosigner == true };`,
    visualReady: true,
  },
];
