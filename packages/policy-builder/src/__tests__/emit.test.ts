import { describe, expect, it } from 'vitest';
import { emitPolicy, emitPolicySet } from '../emit.js';
import type { VisualPolicy } from '../ir.js';

describe('emitPolicy', () => {
  it('emits the simplest permit-all', () => {
    const p: VisualPolicy = {
      id: 'p1',
      effect: 'permit',
      principal: { kind: 'all' },
      action: { kind: 'all' },
      resource: { kind: 'all' },
      conditions: [],
    };
    expect(emitPolicy(p)).toBe('permit (\n  principal,\n  action,\n  resource\n);');
  });

  it('emits permit with action equality + when clause', () => {
    const p: VisualPolicy = {
      id: 'p1',
      effect: 'permit',
      principal: { kind: 'all' },
      action: { kind: 'eq', id: 'read' },
      resource: { kind: 'all' },
      conditions: [
        {
          kind: 'when',
          clause: { kind: 'attr_eq', path: 'context.user.dept', value: 'engineering' },
        },
      ],
    };
    const out = emitPolicy(p);
    expect(out).toContain('action == Action::"read"');
    expect(out).toContain('when { context.user.dept == "engineering" }');
  });

  it('emits action `in` constraint with multiple ids', () => {
    const p: VisualPolicy = {
      id: 'p1',
      effect: 'permit',
      principal: { kind: 'all' },
      action: { kind: 'in', ids: ['read', 'list'] },
      resource: { kind: 'all' },
      conditions: [],
    };
    expect(emitPolicy(p)).toContain('action in [Action::"read", Action::"list"]');
  });

  it('emits resource is-type constraint', () => {
    const p: VisualPolicy = {
      id: 'p1',
      effect: 'permit',
      principal: { kind: 'all' },
      action: { kind: 'all' },
      resource: { kind: 'is', type: 'GitHub::Repo' },
      conditions: [],
    };
    expect(emitPolicy(p)).toContain('resource is GitHub::Repo');
  });

  it('emits time-window in expanded form', () => {
    const p: VisualPolicy = {
      id: 'p1',
      effect: 'permit',
      principal: { kind: 'all' },
      action: { kind: 'all' },
      resource: { kind: 'all' },
      conditions: [
        {
          kind: 'when',
          clause: {
            kind: 'time_window_hour',
            path: 'context.time.hour',
            startHour: 9,
            endHour: 17,
          },
        },
      ],
    };
    expect(emitPolicy(p)).toContain('context.time.hour >= 9 && context.time.hour < 17');
  });

  it('emits unless + numeric comparison', () => {
    const p: VisualPolicy = {
      id: 'p1',
      effect: 'permit',
      principal: { kind: 'all' },
      action: { kind: 'all' },
      resource: { kind: 'all' },
      conditions: [
        {
          kind: 'unless',
          clause: { kind: 'numeric_cmp', op: '>', path: 'context.amount', value: 100 },
        },
      ],
    };
    expect(emitPolicy(p)).toContain('unless { context.amount > 100 }');
  });

  it('quotes strings safely (escapes embedded quotes)', () => {
    const p: VisualPolicy = {
      id: 'p1',
      effect: 'permit',
      principal: { kind: 'eq', entity: { type: 'Agent', id: 'with"quote' } },
      action: { kind: 'all' },
      resource: { kind: 'all' },
      conditions: [],
    };
    expect(emitPolicy(p)).toContain('Agent::"with\\"quote"');
  });

  it('emits has-attr chains for nested context paths', () => {
    const p: VisualPolicy = {
      id: 'p1',
      effect: 'permit',
      principal: { kind: 'all' },
      action: { kind: 'all' },
      resource: { kind: 'all' },
      conditions: [{ kind: 'when', clause: { kind: 'has_attr', path: 'context.user.dept' } }],
    };
    expect(emitPolicy(p)).toContain('context has user && context.user has dept');
  });

  it('emits an annotation block', () => {
    const p: VisualPolicy = {
      id: 'p1',
      effect: 'permit',
      principal: { kind: 'all' },
      action: { kind: 'all' },
      resource: { kind: 'all' },
      conditions: [],
      annotations: { id: 'p1' },
    };
    expect(emitPolicy(p).startsWith('@id("p1")\n')).toBe(true);
  });

  it('joins a policy set with a blank line between policies', () => {
    const p: VisualPolicy = {
      id: 'p1',
      effect: 'permit',
      principal: { kind: 'all' },
      action: { kind: 'all' },
      resource: { kind: 'all' },
      conditions: [],
    };
    const text = emitPolicySet([p, { ...p, id: 'p2', effect: 'forbid' }]);
    expect(text.split('\n\n').length).toBe(2);
  });
});
