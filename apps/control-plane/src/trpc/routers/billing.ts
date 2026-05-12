/**
 * Billing tRPC surface (Lane C). Reads usage_counters for the current
 * calendar month and the customer's plan from `customers.plan`. The
 * dashboard /app/billing page and the free-tier banner both consume
 * the same `usage` query so the meter never disagrees with the gate.
 */
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema.js';
import { currentPeriodStart, PLAN_CAPS, type PlanTier } from '../../services/usage.js';
import { router, tenantProcedure } from '../index.js';

export const billingRouter = router({
  /** Current period usage + plan + cap. Refreshes whenever the dashboard
   *  poll fires (default 5s in the free-tier banner). */
  usage: tenantProcedure.query(async ({ ctx }) => {
    const periodStart = currentPeriodStart();
    const customer = await ctx.db.drizzle.query.customers.findFirst({
      where: eq(schema.customers.id, ctx.customerId),
    });
    const plan = (customer?.plan ?? 'free') as PlanTier;
    const cap = PLAN_CAPS[plan];

    const row = await ctx.db.drizzle.query.usageCounters.findFirst({
      where: eq(schema.usageCounters.customerId, ctx.customerId),
    });
    const mintCount = row?.mintCount ?? 0;
    const proxyCount = row?.proxyCount ?? 0;
    const total = mintCount + proxyCount;
    const limit = cap.mintPerMonth;
    const pct = limit === 0 ? 0 : Math.min(100, Math.round((total / limit) * 100));

    const nextResetMs = Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 1);
    const daysToReset = Math.max(0, Math.ceil((nextResetMs - Date.now()) / 86400_000));

    return {
      plan,
      periodStart: periodStart.toISOString(),
      mintCount,
      proxyCount,
      total,
      cap: limit,
      percentUsed: pct,
      daysToReset,
      upgradeStripePriceId: process.env.STRIPE_PRICE_PRO ?? null,
      stripeCheckoutUrl: process.env.STRIPE_CHECKOUT_URL_PRO ?? null,
    };
  }),
});
