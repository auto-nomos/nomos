import { describe, expect, it, vi } from 'vitest';
import { fetchWithRetry } from '../transport.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('fetchWithRetry', () => {
  it('returns immediately on 200', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(jsonResponse({ ok: true }));
    const res = await fetchWithRetry('http://x', { method: 'GET' }, { fetchFn, maxAttempts: 3 });
    expect(res.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('does not retry on 4xx', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(jsonResponse({ error: 'bad' }, 400));
    const res = await fetchWithRetry('http://x', { method: 'GET' }, { fetchFn, maxAttempts: 3 });
    expect(res.status).toBe(400);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('retries on 5xx and eventually succeeds', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 200));
    const res = await fetchWithRetry(
      'http://x',
      { method: 'GET' },
      { fetchFn, maxAttempts: 3, baseDelayMs: 1 },
    );
    expect(res.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('retries on network error and eventually succeeds', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 200));
    const res = await fetchWithRetry(
      'http://x',
      { method: 'GET' },
      { fetchFn, maxAttempts: 3, baseDelayMs: 1 },
    );
    expect(res.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('throws after maxAttempts on persistent network error', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('boom'));
    await expect(
      fetchWithRetry('http://x', { method: 'GET' }, { fetchFn, maxAttempts: 3, baseDelayMs: 1 }),
    ).rejects.toThrow(/boom/);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('returns last 5xx response after maxAttempts (does not throw)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({}, 502));
    const res = await fetchWithRetry(
      'http://x',
      { method: 'GET' },
      { fetchFn, maxAttempts: 3, baseDelayMs: 1 },
    );
    expect(res.status).toBe(502);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
});
