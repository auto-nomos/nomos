import type { AuthGuard, MintedUcan } from '@credential-broker/sdk';
import { describe, expect, it, vi } from 'vitest';
import { runGuarded } from '../run-guarded.js';

function fakeGuard(overrides: Partial<AuthGuard> = {}): AuthGuard {
  const defaultMinted: MintedUcan = {
    jwt: 'jwt-x',
    cid: 'cid-x',
    expiresAt: Date.now() + 600_000,
  };
  return {
    customerId: '00000000-0000-0000-0000-000000000000',
    authorize: vi.fn(),
    emitReceipt: vi.fn(),
    waitForApproval: vi.fn(),
    mintUcan: vi.fn().mockResolvedValue(new Map([['/github/repo/read', defaultMinted]])),
    proxy: vi.fn(),
    ...overrides,
  } as unknown as AuthGuard;
}

describe('runGuarded', () => {
  it('mints a UCAN, calls proxy, and surfaces the upstream payload on allow', async () => {
    const proxy = vi.fn().mockResolvedValue({
      allow: true,
      decision: { allow: true, receiptId: 'r-1' },
      upstream: { status: 200, body: { full_name: 'acme/billing' }, headers: {} },
      connector: 'github',
    });
    const guard = fakeGuard({ proxy });

    const out = await runGuarded(
      guard,
      '/github/repo/read',
      { repo: 'acme/billing' },
      { method: 'GET', path: '/repos/acme/billing' },
    );

    expect(out.status).toBe('allowed');
    expect(out.upstream).toEqual({ status: 200, body: { full_name: 'acme/billing' } });
    expect(guard.mintUcan).toHaveBeenCalledWith({ commands: ['/github/repo/read'] });
    expect(proxy).toHaveBeenCalledWith(
      expect.objectContaining({
        ucan: 'jwt-x',
        command: '/github/repo/read',
        resource: { repo: 'acme/billing' },
      }),
    );
  });

  it('returns denied without surfacing upstream when policy denies', async () => {
    const proxy = vi.fn().mockResolvedValue({
      allow: false,
      decision: { allow: false, reason: 'no_matching_policy', receiptId: 'r-2' },
    });
    const guard = fakeGuard({ proxy });

    const out = await runGuarded(
      guard,
      '/github/repo/read',
      { repo: 'acme/secret' },
      { method: 'GET', path: '/repos/acme/secret' },
    );

    expect(out.status).toBe('denied');
    expect(out.decision?.reason).toBe('no_matching_policy');
    expect(out.upstream).toBeUndefined();
  });

  it('marks the result failed when allow=true but the proxy/upstream step errored', async () => {
    const proxy = vi.fn().mockResolvedValue({
      allow: true,
      decision: { allow: true, receiptId: 'r-3' },
      error: 'upstream_call_failed',
    });
    const guard = fakeGuard({ proxy });

    const out = await runGuarded(
      guard,
      '/github/repo/read',
      { repo: 'acme/billing' },
      { method: 'GET', path: '/repos/acme/billing' },
    );

    expect(out.status).toBe('failed');
    expect(out.error).toBe('upstream_call_failed');
  });
});
