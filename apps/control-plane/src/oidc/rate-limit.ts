/**
 * In-memory token-bucket rate limit for the OIDC mint endpoint.
 *
 * Per-agent. Sized small (~60/min) because the PDP caches AAD/STS session
 * creds for 15min — a healthy agent mints ~4 tokens/hour, not 60/min. The
 * limit is a denial-of-service guardrail against a compromised PDP or
 * runaway agent loop, not a quota.
 *
 * In-process only. Multi-replica control-plane needs Redis (M0c follow-up).
 */

export interface RateLimiter {
  /** Returns true if the request is admitted, false if denied. */
  tryAcquire(key: string): boolean;
}

export interface TokenBucketOptions {
  /** Tokens refilled per minute. */
  ratePerMinute: number;
  /** Maximum tokens that can be held. Defaults to ratePerMinute / 6 (10s burst). */
  burst?: number;
  /** Override for tests. */
  now?: () => number;
}

interface BucketState {
  tokens: number;
  lastRefillMs: number;
}

export function createTokenBucketRateLimiter(opts: TokenBucketOptions): RateLimiter {
  const ratePerMs = opts.ratePerMinute / 60_000;
  const burst = opts.burst ?? Math.max(1, Math.ceil(opts.ratePerMinute / 6));
  const now = opts.now ?? (() => Date.now());
  const buckets = new Map<string, BucketState>();

  return {
    tryAcquire(key: string): boolean {
      const t = now();
      const existing = buckets.get(key);
      if (!existing) {
        buckets.set(key, { tokens: burst - 1, lastRefillMs: t });
        return true;
      }
      const refill = (t - existing.lastRefillMs) * ratePerMs;
      const tokens = Math.min(burst, existing.tokens + refill);
      if (tokens < 1) {
        existing.tokens = tokens;
        existing.lastRefillMs = t;
        return false;
      }
      existing.tokens = tokens - 1;
      existing.lastRefillMs = t;
      return true;
    },
  };
}
