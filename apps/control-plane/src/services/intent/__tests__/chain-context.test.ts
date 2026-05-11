import { describe, expect, it, vi } from 'vitest';
import { createChainContextService } from '../chain-context.js';

function fakeLogger() {
  return {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
    trace: vi.fn(),
    fatal: vi.fn(),
  } as unknown as Parameters<typeof createChainContextService>[0]['logger'];
}

describe('chain-context (disabled)', () => {
  it('returns NOOP when enabled=false', async () => {
    const svc = createChainContextService({
      db: {} as never,
      apiKey: 'x',
      enabled: false,
      timeoutMs: 1000,
      logger: fakeLogger(),
    });
    const facts = await svc.extractAndPersist({
      customerId: 'c1',
      taskId: 't1',
      sessionId: 's1',
      response: { id: 1, email: 'a@b.com' },
    });
    expect(facts).toEqual([]);
    const verdict = await svc.verify({
      customerId: 'c1',
      taskId: 't1',
      sessionId: 's1',
      purpose: 'send notification',
      command: 'mail.send',
      args: { to: 'x@y.com' },
    });
    expect(verdict.verdict).toBe('aligned');
    expect(verdict.reason).toBe('chain_context_disabled');
  });

  it('returns NOOP when apiKey blank', async () => {
    const svc = createChainContextService({
      db: {} as never,
      apiKey: '',
      enabled: true,
      timeoutMs: 1000,
      logger: fakeLogger(),
    });
    const facts = await svc.extractAndPersist({
      customerId: 'c1',
      taskId: 't1',
      sessionId: 's1',
      response: { id: 1 },
    });
    expect(facts).toEqual([]);
  });
});

describe('chain-context (enabled, mocked LLM)', () => {
  it('parses extract response into facts', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [
            {
              text: '{"facts": [{"type": "email", "value": "alice@example.com"}, {"type": "id", "value": "user_42"}]}',
            },
          ],
        }),
      ),
    );
    const inserted: unknown[] = [];
    const fakeDb = {
      insert: () => ({
        values: async (rows: unknown[]) => {
          inserted.push(...rows);
        },
      }),
    } as never;

    const svc = createChainContextService({
      db: fakeDb,
      apiKey: 'k',
      enabled: true,
      timeoutMs: 1000,
      logger: fakeLogger(),
      fetch: fetchFn as unknown as typeof fetch,
    });

    const facts = await svc.extractAndPersist({
      customerId: 'c1',
      taskId: 't1',
      sessionId: 's1',
      response: { hi: 1 },
      sourceRequestId: 'r1',
    });
    expect(facts).toHaveLength(2);
    expect(facts[0]?.type).toBe('email');
    expect(inserted).toHaveLength(2);
  });

  it('returns aligned/misaligned/unsure from verify', async () => {
    const responses = [
      JSON.stringify({ verdict: 'aligned', reason: 'matches' }),
      JSON.stringify({ verdict: 'misaligned', reason: 'unknown email' }),
      'not-json',
    ];
    let i = 0;
    const fetchFn = vi
      .fn()
      .mockImplementation(
        async () => new Response(JSON.stringify({ content: [{ text: responses[i++] }] })),
      );

    const fakeDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => [],
            }),
          }),
        }),
      }),
    } as never;

    const svc = createChainContextService({
      db: fakeDb,
      apiKey: 'k',
      enabled: true,
      timeoutMs: 1000,
      logger: fakeLogger(),
      fetch: fetchFn as unknown as typeof fetch,
    });

    const a = await svc.verify({
      customerId: 'c',
      taskId: 't',
      sessionId: 's',
      purpose: 'send notif',
      command: 'mail.send',
      args: {},
    });
    expect(a.verdict).toBe('aligned');

    const b = await svc.verify({
      customerId: 'c',
      taskId: 't',
      sessionId: 's',
      purpose: 'send notif',
      command: 'mail.send',
      args: {},
    });
    expect(b.verdict).toBe('misaligned');

    const c = await svc.verify({
      customerId: 'c',
      taskId: 't',
      sessionId: 's',
      purpose: 'send notif',
      command: 'mail.send',
      args: {},
    });
    expect(c.verdict).toBe('unsure');
  });
});
