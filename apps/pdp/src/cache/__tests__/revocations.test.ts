import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRevocationCache } from '../revocations.js';

const logger = pino({ level: 'silent' });

describe('createRevocationCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns empty set for unknown customer', () => {
    const cache = createRevocationCache({
      fetchRevocations: async () => undefined,
      refreshIntervalMs: 1000,
      logger,
    });
    expect(cache.getRevoked('cust-1').size).toBe(0);
  });

  it('set() stores revoked CIDs', () => {
    const cache = createRevocationCache({
      fetchRevocations: async () => undefined,
      refreshIntervalMs: 1000,
      logger,
    });
    cache.set('cust-1', ['cid-1', 'cid-2']);
    const revoked = cache.getRevoked('cust-1');
    expect(revoked.has('cid-1')).toBe(true);
    expect(revoked.has('cid-2')).toBe(true);
  });

  it('add() adds a CID without clobbering existing', () => {
    const cache = createRevocationCache({
      fetchRevocations: async () => undefined,
      refreshIntervalMs: 1000,
      logger,
    });
    cache.set('cust-1', ['cid-1']);
    cache.add('cust-1', 'cid-2');
    expect(cache.getRevoked('cust-1').has('cid-1')).toBe(true);
    expect(cache.getRevoked('cust-1').has('cid-2')).toBe(true);
  });

  it('add() initializes set when customer is new', () => {
    const cache = createRevocationCache({
      fetchRevocations: async () => undefined,
      refreshIntervalMs: 1000,
      logger,
    });
    cache.add('cust-1', 'cid-1');
    expect(cache.getRevoked('cust-1').has('cid-1')).toBe(true);
  });

  it('refresh replaces stored CIDs', async () => {
    const cache = createRevocationCache({
      fetchRevocations: async () => ['fresh-1', 'fresh-2'],
      refreshIntervalMs: 1000,
      logger,
    });
    cache.set('cust-1', ['old']);
    cache.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(cache.getRevoked('cust-1').has('fresh-1')).toBe(true);
    expect(cache.getRevoked('cust-1').has('old')).toBe(false);
    cache.stop();
  });

  it('keeps stale set when fetch throws', async () => {
    const cache = createRevocationCache({
      fetchRevocations: async () => {
        throw new Error('upstream down');
      },
      refreshIntervalMs: 1000,
      logger,
    });
    cache.set('cust-1', ['cid-1']);
    cache.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(cache.getRevoked('cust-1').has('cid-1')).toBe(true);
    cache.stop();
  });

  it('uses knownCustomers list when provided', async () => {
    const fetchSpy = vi.fn(async () => ['cid-1']);
    const cache = createRevocationCache({
      fetchRevocations: fetchSpy,
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

  it('refresh() forces an immediate fetch for one customer', async () => {
    const fetchSpy = vi.fn(async () => ['fresh-1']);
    const cache = createRevocationCache({
      fetchRevocations: fetchSpy,
      refreshIntervalMs: 60_000, // intentionally large; we should not need to wait
      logger,
    });
    cache.set('cust-1', ['old']);
    await cache.refresh('cust-1');
    expect(fetchSpy).toHaveBeenCalledWith('cust-1');
    expect(cache.getRevoked('cust-1').has('fresh-1')).toBe(true);
    expect(cache.getRevoked('cust-1').has('old')).toBe(false);
  });

  it('refresh() keeps stale set when fetch throws', async () => {
    const cache = createRevocationCache({
      fetchRevocations: async () => {
        throw new Error('upstream down');
      },
      refreshIntervalMs: 60_000,
      logger,
    });
    cache.set('cust-1', ['cid-1']);
    await cache.refresh('cust-1');
    expect(cache.getRevoked('cust-1').has('cid-1')).toBe(true);
  });

  it('start() is idempotent and stop() is safe', () => {
    const cache = createRevocationCache({
      fetchRevocations: async () => undefined,
      refreshIntervalMs: 1000,
      logger,
    });
    cache.start();
    cache.start();
    cache.stop();
    expect(() => cache.stop()).not.toThrow();
  });

  it('keeps stale value when fetch returns undefined', async () => {
    const cache = createRevocationCache({
      fetchRevocations: async () => undefined,
      refreshIntervalMs: 1000,
      logger,
    });
    cache.set('cust-1', ['cid-1']);
    cache.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(cache.getRevoked('cust-1').has('cid-1')).toBe(true);
    cache.stop();
  });

  it('audit H8 — concurrent refresh() calls dedupe into a single fetch', async () => {
    vi.useRealTimers();
    let fetches = 0;
    const cache = createRevocationCache({
      fetchRevocations: async () => {
        fetches++;
        await new Promise((r) => setTimeout(r, 30));
        return ['fresh-1'];
      },
      refreshIntervalMs: 60_000,
      logger,
    });
    await Promise.all(Array.from({ length: 50 }, () => cache.refresh('cust-x')));
    expect(fetches).toBe(1);
    expect(cache.getRevoked('cust-x').has('fresh-1')).toBe(true);
    // After the in-flight resolves the slot frees so the next call hits again.
    await cache.refresh('cust-x');
    expect(fetches).toBe(2);
  });
});
