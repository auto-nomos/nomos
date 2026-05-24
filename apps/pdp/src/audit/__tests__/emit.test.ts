import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AuditEvent } from '@auto-nomos/shared-types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { auditGenesisHash, createAuditEmitter, decisionToAudit, ZERO_HASH } from '../emit.js';
import { verifyAuditChain } from '../verify.js';

const cust = '550e8400-e29b-41d4-a716-446655440000';

function makeInput(
  overrides: Partial<Parameters<ReturnType<typeof createAuditEmitter>['emit']>[0]> = {},
) {
  return {
    customer_id: cust,
    ts: 1_700_000_000_000,
    agent: 'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH',
    decision: 'allow' as const,
    command: '/github/issue/create',
    resource: { repo: 'acme/billing' },
    context: { ip: '1.2.3.4' },
    ...overrides,
  };
}

describe('createAuditEmitter', () => {
  it('emits an event with prev_hash = zero on first call', async () => {
    const writes: string[] = [];
    const emitter = createAuditEmitter({
      logPath: '/dev/null',
      writer: async (_p, line) => {
        writes.push(line);
      },
    });
    const ev = await emitter.emit(makeInput());
    expect(ev.prev_hash).toBe(ZERO_HASH);
    expect(ev.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(writes).toHaveLength(1);
    const parsed = JSON.parse((writes[0] as string).trim()) as AuditEvent;
    expect(parsed).toEqual(ev);
  });

  it('chains prev_hash to previous hash on subsequent emits', async () => {
    const writes: string[] = [];
    const emitter = createAuditEmitter({
      logPath: '/dev/null',
      writer: async (_p, line) => {
        writes.push(line);
      },
    });
    const a = await emitter.emit(makeInput());
    const b = await emitter.emit(makeInput({ command: '/github/pr/merge' }));
    const c = await emitter.emit(makeInput({ command: '/github/issue/comment' }));
    expect(b.prev_hash).toBe(a.hash);
    expect(c.prev_hash).toBe(b.hash);
    expect(emitter.getLastHash()).toBe(c.hash);
  });

  it('uses initialPrevHash when provided', async () => {
    const seed = 'a'.repeat(64);
    const emitter = createAuditEmitter({
      logPath: '/dev/null',
      writer: async () => {},
      initialPrevHash: seed,
    });
    const ev = await emitter.emit(makeInput());
    expect(ev.prev_hash).toBe(seed);
  });

  it('produces a chain verifiable by verifyAuditChain', async () => {
    const events: AuditEvent[] = [];
    const emitter = createAuditEmitter({
      logPath: '/dev/null',
      writer: async (_p, line) => {
        events.push(JSON.parse(line.trim()) as AuditEvent);
      },
    });
    for (let i = 0; i < 5; i++) {
      await emitter.emit(makeInput({ ts: 1_700_000_000_000 + i }));
    }
    const result = verifyAuditChain(events);
    expect(result.ok).toBe(true);
  });

  it('verifyAuditChain detects hash tampering', async () => {
    const events: AuditEvent[] = [];
    const emitter = createAuditEmitter({
      logPath: '/dev/null',
      writer: async (_p, line) => {
        events.push(JSON.parse(line.trim()) as AuditEvent);
      },
    });
    await emitter.emit(makeInput());
    await emitter.emit(makeInput({ command: '/github/pr/merge' }));
    // Tamper with the second event's command, leaving its hash unchanged
    (events[1] as AuditEvent & { command: string }).command = '/github/repo/delete';
    const result = verifyAuditChain(events);
    expect(result.ok).toBe(false);
    expect(result.brokenAt).toBe(1);
    expect(result.reason).toBe('hash_mismatch');
  });

  it('verifyAuditChain detects prev_hash splice', async () => {
    const events: AuditEvent[] = [];
    const emitter = createAuditEmitter({
      logPath: '/dev/null',
      writer: async (_p, line) => {
        events.push(JSON.parse(line.trim()) as AuditEvent);
      },
    });
    await emitter.emit(makeInput());
    await emitter.emit(makeInput({ command: '/github/pr/merge' }));
    // Splice: rewrite event[1].prev_hash to all-zero — chain should detect
    (events[1] as AuditEvent).prev_hash = ZERO_HASH;
    const result = verifyAuditChain(events);
    expect(result.ok).toBe(false);
    expect(result.brokenAt).toBe(1);
    expect(result.reason).toBe('prev_hash_mismatch');
  });

  it('verifyAuditChain returns ok for empty input', () => {
    expect(verifyAuditChain([])).toEqual({ ok: true });
  });

  describe('default writer', () => {
    let dir: string;
    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), 'cb-audit-'));
    });
    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it('appends a JSON line to the configured log path', async () => {
      const logPath = join(dir, 'audit.log');
      const emitter = createAuditEmitter({ logPath });
      const a = await emitter.emit(makeInput());
      const b = await emitter.emit(makeInput({ command: '/github/pr/merge' }));
      const contents = await readFile(logPath, 'utf8');
      const lines = contents.trim().split('\n');
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0] as string)).toEqual(a);
      expect(JSON.parse(lines[1] as string)).toEqual(b);
    });
  });
});

describe('auditGenesisHash (C3)', () => {
  it('is deterministic for the same customerId + secret', () => {
    const a = auditGenesisHash('cust-1', 'super-secret-32-chars-or-more');
    const b = auditGenesisHash('cust-1', 'super-secret-32-chars-or-more');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(ZERO_HASH);
  });

  it('differs across customers with the same secret', () => {
    const a = auditGenesisHash('cust-1', 'sec');
    const b = auditGenesisHash('cust-2', 'sec');
    expect(a).not.toBe(b);
  });

  it('differs across secrets for the same customer', () => {
    const a = auditGenesisHash('cust-1', 'sec-a');
    const b = auditGenesisHash('cust-1', 'sec-b');
    expect(a).not.toBe(b);
  });
});

describe('verifyAuditChain genesisFor (C3)', () => {
  // Build a 2-event chain whose first event uses a pinned genesis.
  function chainPinnedToGenesis(pinned: string) {
    const events: AuditEvent[] = [];
    const emitter = createAuditEmitter({
      logPath: '/dev/null',
      writer: async (_p, line) => {
        events.push(JSON.parse(line.trim()) as AuditEvent);
      },
      initialPrevHash: pinned,
    });
    return { events, emitter };
  }

  it('accepts a chain whose first prev_hash matches the pinned genesis', async () => {
    const pinned = auditGenesisHash(cust, 'sec');
    const { events, emitter } = chainPinnedToGenesis(pinned);
    await emitter.emit(makeInput());
    await emitter.emit(makeInput({ command: '/github/pr/merge' }));
    const result = verifyAuditChain(events, {
      genesisFor: (id) => auditGenesisHash(id, 'sec'),
    });
    expect(result.ok).toBe(true);
  });

  it('rejects a chain that starts with ZERO_HASH when genesisFor is configured', async () => {
    const { events, emitter } = chainPinnedToGenesis(ZERO_HASH);
    await emitter.emit(makeInput());
    const result = verifyAuditChain(events, {
      genesisFor: (id) => auditGenesisHash(id, 'sec'),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('prev_hash_mismatch');
    expect(result.brokenAt).toBe(0);
  });

  it('accepts ZERO_HASH genesis when acceptLegacyZeroHash is true', async () => {
    const { events, emitter } = chainPinnedToGenesis(ZERO_HASH);
    await emitter.emit(makeInput());
    const result = verifyAuditChain(events, {
      genesisFor: (id) => auditGenesisHash(id, 'sec'),
      acceptLegacyZeroHash: true,
    });
    expect(result.ok).toBe(true);
  });
});

describe('decisionToAudit', () => {
  it('allow → allow', () => {
    expect(decisionToAudit({ allow: true })).toBe('allow');
  });
  it('deny without stepup → deny', () => {
    expect(decisionToAudit({ allow: false })).toBe('deny');
  });
  it('deny with requiresStepUp → stepup', () => {
    expect(decisionToAudit({ allow: false, requiresStepUp: true })).toBe('stepup');
  });
  it('allow with stepup is still allow', () => {
    expect(decisionToAudit({ allow: true, requiresStepUp: true })).toBe('allow');
  });
});
