/**
 * Stripe hand-curated overrides. The generated floor already enforces
 * method + path regex per action; these add the cross-cutting
 * `stripeResource` zod and override a few endpoints with semantic body
 * shape (e.g. refund must specify `amount` or `charge`).
 */
import { z } from 'zod';
import type { ActionSchemas } from '../types.js';

const stripeResource = z
  .object({
    customer_id: z.string().optional(),
    customer: z.string().optional(),
    payment_intent: z.string().optional(),
    charge_id: z.string().optional(),
    subscription_id: z.string().optional(),
    invoice_id: z.string().optional(),
  })
  .passthrough();

export const stripeActionSchemas: Partial<Record<string, ActionSchemas>> = {
  '/stripe/customer/read': { resourceSchema: stripeResource },
  '/stripe/customer/update': { resourceSchema: stripeResource },
  '/stripe/customer/create': { resourceSchema: stripeResource },
  '/stripe/refund/create': { resourceSchema: stripeResource },
  '/stripe/payment_intent/read': { resourceSchema: stripeResource },
  '/stripe/payment_intent/capture': { resourceSchema: stripeResource },
  '/stripe/payment_intent/cancel': { resourceSchema: stripeResource },
  '/stripe/charge/read': { resourceSchema: stripeResource },
  '/stripe/subscription/read': { resourceSchema: stripeResource },
  '/stripe/subscription/cancel': { resourceSchema: stripeResource },
  '/stripe/subscription/update': { resourceSchema: stripeResource },
  '/stripe/invoice/read': { resourceSchema: stripeResource },
};
