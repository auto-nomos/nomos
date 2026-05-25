import { describe, expect, it } from 'vitest';
import { recordHandoff } from '../observability.js';

describe('recordHandoff', () => {
  it('attaches the typed handoff envelope to a fresh apiCall', () => {
    const apiCall = { method: 'POST', path: '/issues' };
    const out = recordHandoff(apiCall, {
      toAgentDid: 'did:web:writer.test',
      task: 'draft notes',
    });
    expect(out).toEqual({
      method: 'POST',
      path: '/issues',
      handoff: {
        toAgentDid: 'did:web:writer.test',
        task: 'draft notes',
      },
    });
    // Pure — input is not mutated.
    expect(apiCall).toEqual({ method: 'POST', path: '/issues' });
  });

  it('omits expectedOutput + rationale when undefined', () => {
    const out = recordHandoff({}, { toAgentDid: 'did:web:writer.test', task: 'just do it' });
    expect(out.handoff).toEqual({
      toAgentDid: 'did:web:writer.test',
      task: 'just do it',
    });
    expect('expectedOutput' in (out.handoff ?? {})).toBe(false);
    expect('rationale' in (out.handoff ?? {})).toBe(false);
  });

  it('includes all four fields when provided', () => {
    const out = recordHandoff(
      {},
      {
        toAgentDid: 'did:web:writer.test',
        task: 'draft notes',
        expectedOutput: '<= 200 words markdown',
        rationale: 'parent is planner; writer owns prose',
      },
    );
    expect(out.handoff).toEqual({
      toAgentDid: 'did:web:writer.test',
      task: 'draft notes',
      expectedOutput: '<= 200 words markdown',
      rationale: 'parent is planner; writer owns prose',
    });
  });

  it('caller-supplied handoff wins (no-op when already present)', () => {
    const existing = {
      handoff: {
        toAgentDid: 'did:web:already.test',
        task: 'already declared',
      },
    };
    const out = recordHandoff(existing, {
      toAgentDid: 'did:web:other.test',
      task: 'would clobber',
    });
    expect(out.handoff?.toAgentDid).toBe('did:web:already.test');
    expect(out.handoff?.task).toBe('already declared');
  });
});
