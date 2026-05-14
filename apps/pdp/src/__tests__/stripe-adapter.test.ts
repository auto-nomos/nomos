import type { StripeConstraint } from '@auto-nomos/shared-types';
import { describe, expect, it } from 'vitest';
import { validateStripeProxyCall } from '../adapters/stripe.js';

describe('validateStripeProxyCall', () => {
  const customerConstraint: StripeConstraint = {
    provider: 'stripe',
    customer_id: 'cus_ACME',
  };

  it('allows in-scope read for the pinned customer', () => {
    expect(
      validateStripeProxyCall(customerConstraint, {
        method: 'GET',
        path: '/customers/cus_ACME',
      }),
    ).toEqual({ ok: true });
  });

  it('rejects read of a different customer', () => {
    expect(
      validateStripeProxyCall(customerConstraint, {
        method: 'GET',
        path: '/customers/cus_OTHER',
      }),
    ).toEqual({ ok: false, reason: 'customer_mismatch' });
  });

  it('rejects payment_intent create body.customer mismatch', () => {
    expect(
      validateStripeProxyCall(customerConstraint, {
        method: 'POST',
        path: '/payment_intents',
        body: { customer: 'cus_OTHER', amount: 1000, currency: 'usd' },
      }),
    ).toEqual({ ok: false, reason: 'customer_mismatch' });
  });

  it('accepts form-encoded string body', () => {
    expect(
      validateStripeProxyCall(customerConstraint, {
        method: 'POST',
        path: '/payment_intents',
        body: 'customer=cus_ACME&amount=1000&currency=usd',
      }),
    ).toEqual({ ok: true });
  });

  it('rejects unparseable paths', () => {
    expect(
      validateStripeProxyCall(customerConstraint, {
        method: 'GET',
        path: '/v2/random',
      }),
    ).toEqual({ ok: false, reason: 'unparseable_path' });
  });

  it('account_id constraint rejects missing or wrong Stripe-Account header', () => {
    const ac: StripeConstraint = {
      provider: 'stripe',
      account_id: 'acct_LIVE',
    };
    expect(
      validateStripeProxyCall(ac, {
        method: 'GET',
        path: '/charges/ch_X',
        headers: { 'stripe-account': 'acct_OTHER' },
      }),
    ).toEqual({ ok: false, reason: 'account_mismatch' });
  });

  it('path_prefix narrows to one namespace', () => {
    const pc: StripeConstraint = {
      provider: 'stripe',
      path_prefix: '/customers/',
    };
    expect(validateStripeProxyCall(pc, { method: 'POST', path: '/refunds' })).toEqual({
      ok: false,
      reason: 'path_outside_constraint',
    });
  });
});
