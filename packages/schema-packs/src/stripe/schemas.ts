/**
 * Stripe hand-curated overrides. The generated floor already enforces
 * method + path regex per action; these add the cross-cutting
 * `stripeResource` zod and override a few endpoints with semantic body
 * shape (e.g. payment_intent.create requires amount + currency).
 */
import { z } from 'zod';
import type { ActionSchemas } from '../types.js';
import { actions } from './templates.js';

const safePath = z
  .string()
  .min(1)
  .refine((p: string) => !p.includes('..') && !p.includes('//'), {
    message: 'path must not contain `..` or `//` segments',
  });

const apiCallBase = z.object({
  method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']),
  path: safePath,
  query: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

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

const postCall = apiCallBase.extend({ method: z.literal('POST') });

/** POST /v1/invoices — customer required. */
const createInvoiceCall = postCall.extend({
  body: z
    .object({ customer: z.string().min(1) })
    .passthrough()
    .optional(),
});

/** POST /v1/payment_intents — amount + currency required. */
const createPaymentIntentCall = postCall.extend({
  body: z
    .object({
      amount: z.number().int().positive(),
      currency: z.string().min(1),
    })
    .passthrough()
    .optional(),
});

/** POST /v1/refunds — charge OR payment_intent required. */
const createRefundCall = postCall.extend({
  body: z
    .object({})
    .passthrough()
    .refine(
      (b) =>
        typeof (b as { charge?: unknown }).charge === 'string' ||
        typeof (b as { payment_intent?: unknown }).payment_intent === 'string',
      { message: 'refund requires `charge` or `payment_intent`' },
    )
    .optional(),
});

/** POST /v1/subscriptions — customer + items required. */
const createSubscriptionCall = postCall.extend({
  body: z
    .object({
      customer: z.string().min(1),
      items: z.array(z.unknown()),
    })
    .passthrough()
    .optional(),
});

const handCurated: Partial<Record<string, ActionSchemas>> = {
  '/stripe/invoice/create': { apiCallSchema: createInvoiceCall },
  '/stripe/payment_intent/create': { apiCallSchema: createPaymentIntentCall },
  '/stripe/refund/create': { apiCallSchema: createRefundCall },
  '/stripe/subscription/create': { apiCallSchema: createSubscriptionCall },
};

export const stripeActionSchemas: Partial<Record<string, ActionSchemas>> = Object.fromEntries(
  actions.map((cmd) => [cmd, { ...handCurated[cmd], resourceSchema: stripeResource }]),
);
