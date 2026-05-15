import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../../../logger.js';
import { createResendInviteNotifier } from '../resend.js';

const fakeLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
  trace: vi.fn(),
  silent: vi.fn(),
  level: 'info' as const,
  child: () => fakeLogger,
} as unknown as Logger;

function payload() {
  return {
    email: 'newbie@example.com',
    orgName: 'Acme',
    role: 'agent_manager' as const,
    token: 'tok_abc123',
    expiresAt: new Date('2026-06-01T00:00:00Z'),
    invitedBy: { email: 'alice@acme.com', name: 'Alice' },
  };
}

describe('createResendInviteNotifier', () => {
  it('falls back to logger when RESEND_API_KEY missing', async () => {
    const fetchFn = vi.fn();
    const notifier = createResendInviteNotifier({
      apiKey: undefined,
      from: 'invites@auto-nomos.com',
      dashboardUrl: 'https://app.auto-nomos.com',
      logger: fakeLogger,
      fetch: fetchFn as unknown as typeof fetch,
    });
    await notifier(payload());
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('falls back to logger when RESEND_FROM missing', async () => {
    const fetchFn = vi.fn();
    const notifier = createResendInviteNotifier({
      apiKey: 're_test',
      from: undefined,
      dashboardUrl: 'https://app.auto-nomos.com',
      logger: fakeLogger,
      fetch: fetchFn as unknown as typeof fetch,
    });
    await notifier(payload());
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('POSTs to Resend with subject, html, text, accept link', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'em_x' }), {
        status: 200,
      }),
    );
    const notifier = createResendInviteNotifier({
      apiKey: 're_live_abc',
      from: 'Nomos <invites@auto-nomos.com>',
      dashboardUrl: 'https://app.auto-nomos.com/',
      logger: fakeLogger,
      fetch: fetchFn as unknown as typeof fetch,
    });
    await notifier(payload());

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const call = fetchFn.mock.calls[0];
    if (!call) throw new Error('no fetch call recorded');
    const [url, init] = call as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe('Bearer re_live_abc');
    const body = JSON.parse(init.body as string);
    expect(body.from).toBe('Nomos <invites@auto-nomos.com>');
    expect(body.to).toEqual(['newbie@example.com']);
    expect(body.reply_to).toBe('alice@acme.com');
    expect(body.subject).toContain('Acme');
    expect(body.subject).toContain('Alice');
    expect(body.html).toContain('https://app.auto-nomos.com/accept-invite?token=tok_abc123');
    expect(body.text).toContain('tok_abc123');
    expect(body.tags).toContainEqual({ name: 'role', value: 'agent_manager' });
  });

  it('swallows fetch errors so invite row stays', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('boom'));
    const notifier = createResendInviteNotifier({
      apiKey: 're_live_abc',
      from: 'Nomos <invites@auto-nomos.com>',
      dashboardUrl: 'https://app.auto-nomos.com',
      logger: fakeLogger,
      fetch: fetchFn as unknown as typeof fetch,
    });
    await expect(notifier(payload())).resolves.toBeUndefined();
  });
});
