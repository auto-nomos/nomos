import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../logger.js';
import { createStepUpNotifier } from '../services/stepup/notify.js';

function makeLogger(): { logger: Logger; calls: Array<{ level: string; arg: unknown }> } {
  const calls: Array<{ level: string; arg: unknown }> = [];
  const make = (level: string) => (arg: unknown) => calls.push({ level, arg });
  const logger = {
    debug: make('debug'),
    info: make('info'),
    warn: make('warn'),
    error: make('error'),
    fatal: make('fatal'),
    trace: make('trace'),
    child: () => logger,
  } as unknown as Logger;
  return { logger, calls };
}

describe('createStepUpNotifier', () => {
  const args = {
    approvalId: 'a1',
    customerId: 'c1',
    agentId: 'ag1',
    decidingUserId: 'u1',
    command: '/stripe/charge',
    resource: { amount: 250 },
    deepLink: 'http://localhost:3000/approve/a1',
  };

  it('logs dev-console fallback when apiKey blank', async () => {
    const { logger, calls } = makeLogger();
    const fetchFn = vi.fn();
    const notify = createStepUpNotifier({ apiKey: undefined, logger, fetch: fetchFn });
    await notify(args);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(calls.some((c) => c.level === 'info')).toBe(true);
    const infoArg = calls.find((c) => c.level === 'info')?.arg as Record<string, unknown>;
    expect(infoArg.deepLink).toBe(args.deepLink);
    expect(infoArg.devFallback).toBe(true);
  });

  it('POSTs to Knock with bearer + recipient when apiKey set', async () => {
    const { logger } = makeLogger();
    const fetchFn = vi.fn(async () => new Response('{}', { status: 200 }));
    const notify = createStepUpNotifier({
      apiKey: 'sk_live_x',
      workflow: 'step-up-request',
      logger,
      fetch: fetchFn,
    });
    await notify(args);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.knock.app/v1/workflows/step-up-request/trigger');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk_live_x');
    const body = JSON.parse(init.body as string);
    expect(body.recipients).toEqual([args.decidingUserId]);
    expect(body.data.deepLink).toBe(args.deepLink);
    expect(body.data.command).toBe(args.command);
    expect(body.data.approvalId).toBe(args.approvalId);
  });

  it('swallows Knock 5xx without throwing — caller must not block on push', async () => {
    const { logger, calls } = makeLogger();
    const fetchFn = vi.fn(async () => new Response('boom', { status: 503 }));
    const notify = createStepUpNotifier({ apiKey: 'sk_live_x', logger, fetch: fetchFn });
    await expect(notify(args)).resolves.toBeUndefined();
    expect(calls.some((c) => c.level === 'warn' || c.level === 'error')).toBe(true);
  });

  it('swallows network errors', async () => {
    const { logger, calls } = makeLogger();
    const fetchFn = vi.fn(async () => {
      throw new Error('econnrefused');
    });
    const notify = createStepUpNotifier({ apiKey: 'sk_live_x', logger, fetch: fetchFn });
    await expect(notify(args)).resolves.toBeUndefined();
    expect(calls.some((c) => c.level === 'warn' || c.level === 'error')).toBe(true);
  });

  describe('audit H9 rate limit + dedup', () => {
    it('suppresses second send for same approvalId inside dedup window', async () => {
      const { logger } = makeLogger();
      const fetchFn = vi.fn(async () => new Response('{}', { status: 200 }));
      const notify = createStepUpNotifier({
        apiKey: 'sk_live_x',
        logger,
        fetch: fetchFn,
        rateLimit: { perApprovalDedupMs: 60_000, now: () => 1_000 },
      });
      await notify(args);
      await notify(args);
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('caps per-user burst (5 sends / 60s default)', async () => {
      const { logger } = makeLogger();
      const fetchFn = vi.fn(async () => new Response('{}', { status: 200 }));
      let t = 0;
      const notify = createStepUpNotifier({
        apiKey: 'sk_live_x',
        logger,
        fetch: fetchFn,
        rateLimit: {
          perUserMaxBurst: 3,
          perUserWindowMs: 60_000,
          perApprovalDedupMs: 0,
          now: () => t,
        },
      });
      for (let i = 0; i < 6; i++) {
        t = i * 100;
        await notify({ ...args, approvalId: `a-${i}` });
      }
      expect(fetchFn).toHaveBeenCalledTimes(3);
    });

    it('window rolls forward: after windowMs elapses, sends resume', async () => {
      const { logger } = makeLogger();
      const fetchFn = vi.fn(async () => new Response('{}', { status: 200 }));
      let t = 0;
      const notify = createStepUpNotifier({
        apiKey: 'sk_live_x',
        logger,
        fetch: fetchFn,
        rateLimit: {
          perUserMaxBurst: 2,
          perUserWindowMs: 1_000,
          perApprovalDedupMs: 0,
          now: () => t,
        },
      });
      await notify({ ...args, approvalId: 'a-1' });
      await notify({ ...args, approvalId: 'a-2' });
      await notify({ ...args, approvalId: 'a-3' });
      expect(fetchFn).toHaveBeenCalledTimes(2);
      t = 2_000;
      await notify({ ...args, approvalId: 'a-4' });
      expect(fetchFn).toHaveBeenCalledTimes(3);
    });

    it('disable bypasses both limits', async () => {
      const { logger } = makeLogger();
      const fetchFn = vi.fn(async () => new Response('{}', { status: 200 }));
      const notify = createStepUpNotifier({
        apiKey: 'sk_live_x',
        logger,
        fetch: fetchFn,
        rateLimit: { disable: true },
      });
      for (let i = 0; i < 20; i++) await notify(args);
      expect(fetchFn).toHaveBeenCalledTimes(20);
    });
  });
});
