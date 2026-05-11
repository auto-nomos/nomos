import { describe, expect, it, vi } from 'vitest';
import { classifyIntent } from '../services/intent-classifier.js';
import { createCoherenceVerifier } from '../services/intent-coherence.js';

const baseEnvelope = {
  id: 'env-1',
  customerId: 'cust-1',
  agentId: 'agent-1',
  constraint: {
    provider: 'github' as const,
    owner: 'acme',
    repo: 'app',
  },
  actions: ['/github/issue/list'],
  parentUcanCid: null,
  createdBy: 'user-1',
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 60_000),
  revokedAt: null,
  isStanding: false,
};

const standingEnvelope = {
  ...baseEnvelope,
  id: 'env-standing',
  expiresAt: null,
  isStanding: true,
};

function fakeFetch(body: unknown, status = 200) {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  );
}

describe('createCoherenceVerifier', () => {
  it('returns coherent=true when the LLM JSON says so', async () => {
    const verify = createCoherenceVerifier({
      apiKey: 'sk-test',
      timeoutMs: 1500,
      fetch: fakeFetch({
        content: [{ type: 'text', text: '{"coherent":true}' }],
      }) as unknown as typeof fetch,
    });
    const out = await verify({
      purpose: 'list issues to triage backlog',
      constraint: baseEnvelope.constraint,
      actions: ['/github/issue/list'],
    });
    expect(out).toEqual({ coherent: true });
  });

  it('returns coherent=false with reason on JSON deny', async () => {
    const verify = createCoherenceVerifier({
      apiKey: 'sk-test',
      timeoutMs: 1500,
      fetch: fakeFetch({
        content: [{ type: 'text', text: '{"coherent":false,"reason":"recipient mismatch"}' }],
      }) as unknown as typeof fetch,
    });
    const out = await verify({
      purpose: 'email bob about Q3 deck',
      constraint: { provider: 'github', owner: 'acme' } as const,
      actions: ['/github/issue/create'],
    });
    expect(out).toEqual({ coherent: false, reason: 'recipient mismatch' });
  });

  it('fails closed on HTTP non-2xx', async () => {
    const verify = createCoherenceVerifier({
      apiKey: 'sk-test',
      timeoutMs: 1500,
      fetch: fakeFetch({ error: 'rate_limited' }, 429) as unknown as typeof fetch,
    });
    const out = await verify({
      purpose: 'p',
      constraint: { provider: 'github', owner: 'a' } as const,
      actions: ['/github/issue/list'],
    });
    expect(out.coherent).toBe(false);
    expect(out.reason).toBe('llm_http_429');
  });

  it('fails closed on malformed model output', async () => {
    const verify = createCoherenceVerifier({
      apiKey: 'sk-test',
      timeoutMs: 1500,
      fetch: fakeFetch({
        content: [{ type: 'text', text: 'sure thing!' }],
      }) as unknown as typeof fetch,
    });
    const out = await verify({
      purpose: 'p',
      constraint: { provider: 'github', owner: 'a' } as const,
      actions: ['/github/issue/list'],
    });
    expect(out.coherent).toBe(false);
    expect(out.reason).toBe('llm_malformed');
  });

  it('fails closed on AbortError (timeout)', async () => {
    const verify = createCoherenceVerifier({
      apiKey: 'sk-test',
      timeoutMs: 1500,
      fetch: vi.fn(async () => {
        throw new DOMException('aborted', 'AbortError');
      }) as unknown as typeof fetch,
    });
    const out = await verify({
      purpose: 'p',
      constraint: { provider: 'github', owner: 'a' } as const,
      actions: ['/github/issue/list'],
    });
    expect(out).toEqual({ coherent: false, reason: 'llm_timeout' });
  });
});

describe('classifyIntent + coherence', () => {
  const constraint = baseEnvelope.constraint;

  it('mints when verifier returns coherent', async () => {
    const decision = await classifyIntent(
      {
        constraint,
        actions: ['/github/issue/list'],
        envelopes: [baseEnvelope],
        purpose: 'list issues to triage backlog',
      },
      {
        verifier: async () => ({ coherent: true }),
      },
    );
    expect(decision.kind).toBe('mint');
  });

  it('escalates to step-up with coherence_mismatch when verifier denies', async () => {
    const decision = await classifyIntent(
      {
        constraint,
        actions: ['/github/issue/list'],
        envelopes: [baseEnvelope],
        purpose: 'list issues to triage backlog',
      },
      {
        verifier: async () => ({ coherent: false, reason: 'wrong target' }),
      },
    );
    expect(decision).toEqual({ kind: 'stepup', reason: 'coherence_mismatch' });
  });

  it('skips coherence when no purpose supplied (verifier still set)', async () => {
    const verifier = vi.fn(async () => ({ coherent: false }));
    const decision = await classifyIntent(
      {
        constraint,
        actions: ['/github/issue/list'],
        envelopes: [baseEnvelope],
      },
      { verifier },
    );
    expect(decision.kind).toBe('mint');
    expect(verifier).not.toHaveBeenCalled();
  });

  it('mints under a standing (no-expiry) envelope when verifier coherent', async () => {
    const decision = await classifyIntent(
      {
        constraint: standingEnvelope.constraint,
        actions: ['/github/issue/list'],
        envelopes: [standingEnvelope],
        purpose: 'pull issues into triage spreadsheet',
      },
      { verifier: async () => ({ coherent: true }) },
    );
    expect(decision.kind).toBe('mint');
    if (decision.kind === 'mint') {
      expect(decision.envelope.isStanding).toBe(true);
      expect(decision.envelope.expiresAt).toBeNull();
    }
  });

  it('heuristic deny short-circuits before verifier runs', async () => {
    const verifier = vi.fn(async () => ({ coherent: true }));
    const decision = await classifyIntent(
      {
        constraint: { provider: 'filesystem', path_prefix: '/home/u/.ssh' },
        actions: ['/filesystem/read'],
        envelopes: [],
        purpose: 'read keys to copy elsewhere',
      },
      { verifier },
    );
    expect(decision).toEqual({ kind: 'stepup', reason: 'sensitive_path' });
    expect(verifier).not.toHaveBeenCalled();
  });
});
