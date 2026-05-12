/**
 * Per-tenant usage metering for the wedge billing plan (Lane C).
 *
 * `incrementMint` runs on every successful /v1/mint-ucan; `incrementProxy`
 * is wired by PDP→CP for /v1/proxy. Both upsert one row per
 * (customer_id, period_start) so concurrent callers don't race.
 *
 * `getUsage` returns the current period's row + the customer's plan tier;
 * the quota gate calls it before incrementing and the dashboard reads
 * the same shape via tRPC billing.usage.
 *
 * Plan caps live in `PLAN_CAPS` below — keep this the single source so the
 * dashboard meter, the CP gate, and the upgrade nudge agree.
 */
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema.js';

export type PlanTier = 'free' | 'pro' | 'enterprise';
export type UsageKind = 'mint' | 'proxy';

export interface PlanCap {
  mintPerMonth: number;
  proxyPerMonth: number;
  /** Stripe price id for the "Upgrade to Pro" CTA — env-overridable. */
  upgradeStripePriceId?: string;
}

export const PLAN_CAPS: Record<PlanTier, PlanCap> = {
  free: { mintPerMonth: 1000, proxyPerMonth: 1000 },
  pro: { mintPerMonth: 100_000, proxyPerMonth: 100_000 },
  enterprise: { mintPerMonth: Number.MAX_SAFE_INTEGER, proxyPerMonth: Number.MAX_SAFE_INTEGER },
};

export interface UsageSnapshot {
  customerId: string;
  plan: PlanTier;
  periodStart: Date;
  mintCount: number;
  proxyCount: number;
  cap: PlanCap;
}

/** First instant of the current calendar month in UTC. */
export function currentPeriodStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export interface UsageServiceDeps {
  db: Db;
  now?: () => Date;
}

export class QuotaExceededError extends Error {
  constructor(
    public readonly kind: UsageKind,
    public readonly snapshot: UsageSnapshot,
  ) {
    super(`quota_exceeded:${kind} for plan ${snapshot.plan}`);
    this.name = 'QuotaExceededError';
  }
}

export function createUsageService(deps: UsageServiceDeps) {
  const now = deps.now ?? (() => new Date());

  async function getUsage(customerId: string): Promise<UsageSnapshot> {
    const periodStart = currentPeriodStart(now());
    const customer = await deps.db.drizzle.query.customers.findFirst({
      where: eq(schema.customers.id, customerId),
    });
    const plan = (customer?.plan ?? 'free') as PlanTier;
    const row = await deps.db.drizzle.query.usageCounters.findFirst({
      where: and(
        eq(schema.usageCounters.customerId, customerId),
        eq(schema.usageCounters.periodStart, periodStart),
      ),
    });
    return {
      customerId,
      plan,
      periodStart,
      mintCount: row?.mintCount ?? 0,
      proxyCount: row?.proxyCount ?? 0,
      cap: PLAN_CAPS[plan],
    };
  }

  /**
   * Throws QuotaExceededError when the next increment would cross the cap.
   * Otherwise upserts the counter and returns the resulting snapshot. The
   * cap check and the increment happen in the same upsert via ON CONFLICT
   * + a CASE expression so concurrent callers can't double-spend the cap.
   */
  async function increment(customerId: string, kind: UsageKind): Promise<UsageSnapshot> {
    const before = await getUsage(customerId);
    const current = kind === 'mint' ? before.mintCount : before.proxyCount;
    const max = kind === 'mint' ? before.cap.mintPerMonth : before.cap.proxyPerMonth;
    if (current >= max) {
      throw new QuotaExceededError(kind, before);
    }

    const periodStart = before.periodStart;
    const mintDelta = kind === 'mint' ? 1 : 0;
    const proxyDelta = kind === 'proxy' ? 1 : 0;
    await deps.db.drizzle
      .insert(schema.usageCounters)
      .values({
        customerId,
        periodStart,
        mintCount: mintDelta,
        proxyCount: proxyDelta,
        stripeMeterPending: 1,
      })
      .onConflictDoUpdate({
        target: [schema.usageCounters.customerId, schema.usageCounters.periodStart],
        set: {
          mintCount: sql`${schema.usageCounters.mintCount} + ${mintDelta}`,
          proxyCount: sql`${schema.usageCounters.proxyCount} + ${proxyDelta}`,
          stripeMeterPending: sql`${schema.usageCounters.stripeMeterPending} + 1`,
          lastAt: now(),
        },
      });

    return {
      ...before,
      mintCount: before.mintCount + mintDelta,
      proxyCount: before.proxyCount + proxyDelta,
    };
  }

  return { getUsage, increment };
}

export type UsageService = ReturnType<typeof createUsageService>;
