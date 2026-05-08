import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPolicyCache } from '../policies.js';

const logger = pino({ level: 'silent' });

describe('createPolicyCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns undefined for unknown customer', () => {
    const cache = createPolicyCache({
      fetchBundle: async () => undefined,
      refreshIntervalMs: 1000,
      logger,
    });
    expect(cache.getPolicies('cust-1')).toBeUndefined();
  });

  it('set() stores policies', () => {
    const cache = createPolicyCache({
      fetchBundle: async () => undefined,
      refreshIntervalMs: 1000,
      logger,
    });
    cache.set('cust-1', 'permit(principal, action, resource);');
    expect(cache.getPolicies('cust-1')).toBe('permit(principal, action, resource);');
  });

  it('refresh replaces stored policies', async () => {
    let counter = 0;
    const cache = createPolicyCache({
      fetchBundle: async () => `permit-${++counter}`,
      refreshIntervalMs: 1000,
      logger,
    });
    cache.set('cust-1', 'initial');
    cache.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(cache.getPolicies('cust-1')).toBe('permit-1');
    await vi.advanceTimersByTimeAsync(1000);
    expect(cache.getPolicies('cust-1')).toBe('permit-2');
    cache.stop();
  });

  it('keeps stale value when fetch throws', async () => {
    const cache = createPolicyCache({
      fetchBundle: async () => {
        throw new Error('upstream down');
      },
      refreshIntervalMs: 1000,
      logger,
    });
    cache.set('cust-1', 'good-policy');
    cache.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(cache.getPolicies('cust-1')).toBe('good-policy');
    cache.stop();
  });

  it('keeps stale value when fetch returns undefined', async () => {
    const cache = createPolicyCache({
      fetchBundle: async () => undefined,
      refreshIntervalMs: 1000,
      logger,
    });
    cache.set('cust-1', 'good-policy');
    cache.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(cache.getPolicies('cust-1')).toBe('good-policy');
    cache.stop();
  });

  it('uses knownCustomers when provided', async () => {
    const fetchSpy = vi.fn(async (id: string) => `policy-for-${id}`);
    const cache = createPolicyCache({
      fetchBundle: fetchSpy,
      refreshIntervalMs: 1000,
      logger,
      knownCustomers: () => ['cust-a', 'cust-b'],
    });
    cache.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchSpy).toHaveBeenCalledWith('cust-a');
    expect(fetchSpy).toHaveBeenCalledWith('cust-b');
    cache.stop();
  });

  it('start() is idempotent', () => {
    const cache = createPolicyCache({
      fetchBundle: async () => undefined,
      refreshIntervalMs: 1000,
      logger,
    });
    cache.start();
    cache.start();
    cache.stop();
  });

  it('stop() is safe when never started', () => {
    const cache = createPolicyCache({
      fetchBundle: async () => undefined,
      refreshIntervalMs: 1000,
      logger,
    });
    expect(() => cache.stop()).not.toThrow();
  });
});
