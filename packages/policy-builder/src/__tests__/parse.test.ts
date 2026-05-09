import { describe, expect, it } from 'vitest';
import { parseToIr } from '../parse.js';

describe('parseToIr', () => {
  it('parses permit-all', () => {
    const r = parseToIr('permit (principal, action, resource);');
    expect(r.unrepresentable).toEqual([]);
    expect(r.policies).toHaveLength(1);
    expect(r.policies[0]?.effect).toBe('permit');
    expect(r.policies[0]?.principal).toEqual({ kind: 'all' });
    expect(r.policies[0]?.action).toEqual({ kind: 'all' });
    expect(r.policies[0]?.resource).toEqual({ kind: 'all' });
    expect(r.policies[0]?.conditions).toEqual([]);
  });

  it('parses action equality + attribute equality clause', () => {
    const r = parseToIr(
      'permit (principal, action == Action::"read", resource) when { context.user.dept == "engineering" };',
    );
    expect(r.unrepresentable).toEqual([]);
    expect(r.policies[0]?.action).toEqual({ kind: 'eq', id: 'read' });
    expect(r.policies[0]?.conditions).toEqual([
      {
        kind: 'when',
        clause: { kind: 'attr_eq', path: 'context.user.dept', value: 'engineering' },
      },
    ]);
  });

  it('parses action in [...] (set)', () => {
    const r = parseToIr(
      'permit (principal, action in [Action::"read", Action::"list"], resource);',
    );
    expect(r.unrepresentable).toEqual([]);
    expect(r.policies[0]?.action).toEqual({ kind: 'in', ids: ['read', 'list'] });
  });

  it('parses resource is-type', () => {
    const r = parseToIr('permit (principal, action, resource is GitHub::Repo);');
    expect(r.unrepresentable).toEqual([]);
    expect(r.policies[0]?.resource).toEqual({ kind: 'is', type: 'GitHub::Repo' });
  });

  it('parses numeric < + > clauses as numeric_cmp', () => {
    const r = parseToIr('permit (principal, action, resource) when { context.amount < 100 };');
    expect(r.policies[0]?.conditions[0]).toEqual({
      kind: 'when',
      clause: { kind: 'numeric_cmp', op: '<', path: 'context.amount', value: 100 },
    });
  });

  it('parses time-window AND of >= and < as time_window_hour', () => {
    const r = parseToIr(
      'permit (principal, action, resource) when { context.time.hour >= 9 && context.time.hour < 17 };',
    );
    expect(r.policies[0]?.conditions[0]).toEqual({
      kind: 'when',
      clause: {
        kind: 'time_window_hour',
        path: 'context.time.hour',
        startHour: 9,
        endHour: 17,
      },
    });
  });

  it('marks unsupported expression as raw clause', () => {
    const r = parseToIr('permit (principal, action, resource) when { context.amount + 1 == 100 };');
    // `+` on the LHS is outside the IR's known shapes; we degrade to `raw`
    // but the policy still appears so the head can be edited visually.
    expect(r.policies).toHaveLength(1);
    expect(r.policies[0]?.conditions[0]?.clause.kind).toBe('raw');
  });

  it('returns parse_failed for invalid Cedar', () => {
    const r = parseToIr('this is not cedar');
    expect(r.policies).toEqual([]);
    expect(r.unrepresentable[0]?.reason).toBe('parse_failed');
  });

  it('handles a multi-policy policyset', () => {
    const r = parseToIr(
      'permit (principal, action, resource);\n\nforbid (principal, action == Action::"delete", resource);',
    );
    expect(r.unrepresentable).toEqual([]);
    expect(r.policies).toHaveLength(2);
    expect(r.policies[1]?.effect).toBe('forbid');
  });
});
