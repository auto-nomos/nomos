import { describe, expect, it } from 'vitest';
import type { VisualPolicy } from '../ir.js';
import { parseToIr } from '../parse.js';
import { roundTrip } from '../validate.js';

const FIXTURES: VisualPolicy[] = [
  {
    id: 'permit-all',
    effect: 'permit',
    principal: { kind: 'all' },
    action: { kind: 'all' },
    resource: { kind: 'all' },
    conditions: [],
  },
  {
    id: 'read-only-set',
    effect: 'permit',
    principal: { kind: 'all' },
    action: { kind: 'in', ids: ['read', 'list'] },
    resource: { kind: 'all' },
    conditions: [],
  },
  {
    id: 'time-window',
    effect: 'permit',
    principal: { kind: 'all' },
    action: { kind: 'all' },
    resource: { kind: 'all' },
    conditions: [
      {
        kind: 'when',
        clause: { kind: 'time_window_hour', path: 'context.time.hour', startHour: 9, endHour: 17 },
      },
    ],
  },
  {
    id: 'eq-resource',
    effect: 'permit',
    principal: { kind: 'eq', entity: { type: 'Agent', id: 'a1' } },
    action: { kind: 'eq', id: 'read' },
    resource: { kind: 'eq', entity: { type: 'GitHub::Repo', id: 'acme/billing' } },
    conditions: [],
  },
  {
    id: 'forbid-numeric',
    effect: 'forbid',
    principal: { kind: 'all' },
    action: { kind: 'all' },
    resource: { kind: 'all' },
    conditions: [
      {
        kind: 'when',
        clause: { kind: 'numeric_cmp', op: '>', path: 'context.amount', value: 250 },
      },
    ],
  },
];

describe('round-trip IR ↔ Cedar', () => {
  it.each(
    FIXTURES.map((p) => [p.id, p] as const),
  )('fixture %s emits parseable Cedar that re-parses to the same IR', (_id, fixture) => {
    const rt = roundTrip([fixture]);
    expect(rt.ok).toBe(true);
    if (!rt.ok) return;

    const reparsed = parseToIr(rt.cedarText);
    expect(reparsed.unrepresentable).toEqual([]);
    expect(reparsed.policies).toHaveLength(1);

    const a = reparsed.policies[0];
    expect(a?.effect).toBe(fixture.effect);
    expect(a?.principal).toEqual(fixture.principal);
    expect(a?.action).toEqual(fixture.action);
    expect(a?.resource).toEqual(fixture.resource);
    expect(a?.conditions).toEqual(fixture.conditions);
  });

  it('round-trips a multi-policy set', () => {
    const rt = roundTrip(FIXTURES);
    expect(rt.ok).toBe(true);
    if (!rt.ok) return;
    const reparsed = parseToIr(rt.cedarText);
    expect(reparsed.unrepresentable).toEqual([]);
    expect(reparsed.policies).toHaveLength(FIXTURES.length);
  });
});
