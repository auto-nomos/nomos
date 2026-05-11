import { parseToIr } from '@auto-nomos/policy-builder';
import { describe, expect, it } from 'vitest';
import { listTemplates } from '../index.js';

describe('visualReady contract', () => {
  it.each(
    listTemplates().map((t) => [t.id, t] as const),
  )('template %s matches its visualReady flag', (_id, t) => {
    const r = parseToIr(t.cedarText);
    // parseToIr never fails to load — at minimum each template returns
    // a non-empty `policies` or unrepresentable. We assert the visualReady
    // promise is honored: visualReady=true implies zero unrepresentable.
    if (t.visualReady) {
      expect(r.unrepresentable).toEqual([]);
    } else {
      // visualReady=false: at least one piece must hit the raw fallback
      // OR land in `unrepresentable`. (raw clauses are still "in" policies)
      const anyRaw = r.policies.some((p) => p.conditions.some((c) => c.clause.kind === 'raw'));
      const anyUnrep = r.unrepresentable.length > 0;
      expect(anyRaw || anyUnrep).toBe(true);
    }
  });
});
