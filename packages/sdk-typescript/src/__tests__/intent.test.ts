import { describe, expect, it, vi } from 'vitest';
import { createIntentClient, IntentError } from '../intent.js';

const apiKey = 'cb_00000000-0000-0000-0000-000000000000_secret';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createIntentClient', () => {
  it('returns mint result and forwards intent body verbatim', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        kind: 'mint',
        ucan: 'jwt-x',
        envelopeId: 'env-1',
        expiresAt: 1_700_000_300,
      }),
    ) as unknown as typeof fetch;
    const client = createIntentClient({
      controlPlaneUrl: 'http://cp/',
      apiKey,
      fetchFn,
    });
    const out = await client.request({
      constraint: { provider: 'filesystem', path_prefix: '/x/' },
      actions: ['/filesystem/read'],
      ttlSeconds: 300,
    });
    expect(out.kind).toBe('mint');
    expect((fetchFn as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0]).toBe(
      'http://cp/v1/intent',
    );
    const reqInit = (fetchFn as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]?.[1] as RequestInit;
    expect(JSON.parse(reqInit.body as string)).toMatchObject({
      intent: {
        constraint: { provider: 'filesystem', path_prefix: '/x/' },
        actions: ['/filesystem/read'],
        ttlSeconds: 300,
      },
    });
  });

  it('returns stepup result without throwing', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        kind: 'stepup',
        stepUpId: 'su-1',
        stepUpUrl: 'http://approve/su-1',
        proposedEnvelope: {
          constraint: { provider: 'filesystem', path_prefix: '/x/' },
          actions: ['/filesystem/read'],
          ttlSeconds: 300,
        },
      }),
    ) as unknown as typeof fetch;
    const client = createIntentClient({
      controlPlaneUrl: 'http://cp',
      apiKey,
      fetchFn,
    });
    const out = await client.request({
      constraint: { provider: 'filesystem', path_prefix: '/x/' },
      actions: ['/filesystem/read'],
      ttlSeconds: 300,
    });
    expect(out.kind).toBe('stepup');
  });

  it('throws IntentError on non-2xx', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(403, { error: 'sensitive path', error_code: 'sensitive_path' }),
      ) as unknown as typeof fetch;
    const client = createIntentClient({
      controlPlaneUrl: 'http://cp',
      apiKey,
      fetchFn,
    });
    await expect(
      client.request({
        constraint: { provider: 'filesystem', path_prefix: '/.ssh/' },
        actions: ['/filesystem/read'],
        ttlSeconds: 60,
      }),
    ).rejects.toBeInstanceOf(IntentError);
  });

  it('acquire() runs the stepup retry path and returns a Disposable Grant', async () => {
    const intent = {
      constraint: { provider: 'filesystem' as const, path_prefix: '/x/' },
      actions: ['/filesystem/read'],
      ttlSeconds: 300,
    };
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          kind: 'stepup',
          stepUpId: 'su-1',
          stepUpUrl: 'http://approve/su-1',
          proposedEnvelope: intent,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          kind: 'mint',
          ucan: 'jwt-y',
          envelopeId: 'env-1',
          expiresAt: 1_700_000_300,
        }),
      ) as unknown as typeof fetch;
    const client = createIntentClient({
      controlPlaneUrl: 'http://cp',
      apiKey,
      fetchFn,
    });
    const grant = await client.acquire(intent, async (id, _url) => `cosigner-jwt-for-${id}`);
    expect(grant.ucan).toBe('jwt-y');
    expect(grant.envelopeId).toBe('env-1');
    grant[Symbol.dispose]();
  });
});
