import { describe, expect, it } from 'vitest';
import {
  actionLabel,
  clauseLabel,
  principalLabel,
  resourceLabel,
} from '../components/PolicyBuilder.js';

describe('display labels', () => {
  it('principalLabel handles all variants', () => {
    expect(principalLabel({ kind: 'all' })).toBe('any agent');
    expect(principalLabel({ kind: 'is', type: 'Agent' })).toBe('is Agent');
    expect(principalLabel({ kind: 'eq', entity: { type: 'Agent', id: 'a' } })).toBe('Agent::"a"');
  });

  it('actionLabel handles all variants', () => {
    expect(actionLabel({ kind: 'all' })).toBe('any action');
    expect(actionLabel({ kind: 'eq', id: 'read' })).toBe('Action::"read"');
    expect(actionLabel({ kind: 'in', ids: ['read', 'list'] })).toBe('in ["read", "list"]');
  });

  it('resourceLabel handles all variants', () => {
    expect(resourceLabel({ kind: 'all' })).toBe('any resource');
    expect(resourceLabel({ kind: 'is', type: 'GitHub::Repo' })).toBe('is GitHub::Repo');
    expect(resourceLabel({ kind: 'eq', entity: { type: 'X', id: 'y' } })).toBe('X::"y"');
  });

  it('clauseLabel summarizes each clause kind', () => {
    expect(clauseLabel({ kind: 'attr_eq', path: 'context.x', value: 'y' })).toBe(
      'context.x == "y"',
    );
    expect(
      clauseLabel({
        kind: 'time_window_hour',
        path: 'context.time.hour',
        startHour: 9,
        endHour: 17,
      }),
    ).toBe('context.time.hour in [9, 17)');
    expect(clauseLabel({ kind: 'numeric_cmp', op: '>', path: 'context.amount', value: 100 })).toBe(
      'context.amount > 100',
    );
  });
});
