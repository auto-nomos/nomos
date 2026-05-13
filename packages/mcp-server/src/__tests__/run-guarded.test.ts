import type { AuthGuard, MintedUcan } from '@auto-nomos/sdk';
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

  it('waits for step-up approval and retries with cosignerJwt on approve', async () => {
    const proxy = vi
      .fn()
      .mockResolvedValueOnce({
        allow: false,
        decision: {
          allow: false,
          reason: 'step_up_required',
          receiptId: 'r-su1',
          requiresStepUp: true,
          stepUpId: 'approval-id-42',
          stepUpUrl: 'https://app.example.com/approve/approval-id-42',
        },
      })
      .mockResolvedValueOnce({
        allow: true,
        decision: { allow: true, receiptId: 'r-su2' },
        upstream: { status: 200, body: { ok: true }, headers: {} },
      });
    const waitForApproval = vi.fn().mockResolvedValue({
      id: 'approval-id-42',
      state: 'approved',
      command: '/github/repo/read',
      resource: {},
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      decidedAt: new Date().toISOString(),
      cosignerJwt: 'cosigner-jwt-x',
    });
    const guard = fakeGuard({ proxy, waitForApproval });

    const out = await runGuarded(
      guard,
      '/github/repo/read',
      { repo: 'acme/billing' },
      { method: 'GET', path: '/repos/acme/billing' },
    );

    expect(out.status).toBe('allowed');
    expect(waitForApproval).toHaveBeenCalledWith({ stepUpId: 'approval-id-42' });
    expect(proxy).toHaveBeenCalledTimes(2);
    expect(proxy.mock.calls[1]?.[0]).toMatchObject({ cosignerJwt: 'cosigner-jwt-x' });
  });

  it('keeps deny status when approval times out or expires', async () => {
    const proxy = vi.fn().mockResolvedValue({
      allow: false,
      decision: {
        allow: false,
        reason: 'step_up_required',
        receiptId: 'r-su3',
        requiresStepUp: true,
        stepUpId: 'approval-id-99',
      },
    });
    const waitForApproval = vi.fn().mockResolvedValue({
      id: 'approval-id-99',
      state: 'expired',
      command: '/github/repo/read',
      resource: {},
      expiresAt: new Date().toISOString(),
      decidedAt: null,
      cosignerJwt: null,
    });
    const guard = fakeGuard({ proxy, waitForApproval });

    const out = await runGuarded(
      guard,
      '/github/repo/read',
      { repo: 'acme/billing' },
      { method: 'GET', path: '/repos/acme/billing' },
    );

    expect(out.status).toBe('denied');
    expect(proxy).toHaveBeenCalledTimes(1);
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
