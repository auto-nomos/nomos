/**
 * Cedar text → visual IR.
 *
 * Strategy: split the text into individual policies via cedar-wasm's
 * `policySetTextToParts`, convert each to JSON via `policyToJson`, then
 * pattern-match the JSON against the IR's narrow union. Anything we
 * can't model becomes an `unrepresentable` row so the dashboard can
 * surface "edit in Cedar" without losing the source.
 */
import { policySetTextToParts, policyToJson } from '@cedar-policy/cedar-wasm/nodejs';
import type { Clause, Condition, ParseToIrResult, ScalarLiteral, VisualPolicy } from './ir.js';

type AnyExpr = Record<string, unknown>;

export function parseToIr(cedarText: string): ParseToIrResult {
  const parts = policySetTextToParts(cedarText);
  if (parts.type === 'failure') {
    return { policies: [], unrepresentable: [{ reason: 'parse_failed', cedar: cedarText }] };
  }

  const policies: VisualPolicy[] = [];
  const unrepresentable: { reason: string; cedar: string }[] = [];

  for (let i = 0; i < parts.policies.length; i++) {
    const text = parts.policies[i] as string;
    const json = policyToJson(text);
    if (json.type === 'failure') {
      unrepresentable.push({ reason: 'policy_to_json_failed', cedar: text });
      continue;
    }
    const ir = policyJsonToIr(json.json as unknown as AnyExpr, `p${i}`);
    if (ir.ok) policies.push(ir.policy);
    else unrepresentable.push({ reason: ir.reason, cedar: text });
  }

  return { policies, unrepresentable };
}

interface IrOk {
  ok: true;
  policy: VisualPolicy;
}
interface IrFail {
  ok: false;
  reason: string;
}

function policyJsonToIr(json: AnyExpr, id: string): IrOk | IrFail {
  const effect = json.effect as 'permit' | 'forbid';
  if (effect !== 'permit' && effect !== 'forbid') return { ok: false, reason: 'unknown_effect' };

  const principal = parsePrincipal(json.principal as AnyExpr);
  if (!principal) return { ok: false, reason: 'principal_unsupported' };

  const action = parseAction(json.action as AnyExpr);
  if (!action) return { ok: false, reason: 'action_unsupported' };

  const resource = parseResource(json.resource as AnyExpr);
  if (!resource) return { ok: false, reason: 'resource_unsupported' };

  const conds: Condition[] = [];
  for (const c of (json.conditions as { kind: string; body: AnyExpr }[]) ?? []) {
    const kind = c.kind as 'when' | 'unless';
    if (kind !== 'when' && kind !== 'unless') return { ok: false, reason: 'condition_kind' };
    const clause = parseClause(c.body);
    conds.push({ kind, clause });
  }

  const annotations = (json.annotations as Record<string, string> | undefined) ?? undefined;

  return {
    ok: true,
    policy: {
      id,
      effect,
      principal,
      action,
      resource,
      conditions: conds,
      ...(annotations ? { annotations } : {}),
    },
  };
}

function parsePrincipal(c: AnyExpr): VisualPolicy['principal'] | null {
  const op = c.op as string;
  if (op === 'All') return { kind: 'all' };
  if (op === '==') {
    const e = entityFromConstraint(c);
    if (!e) return null;
    return { kind: 'eq', entity: e };
  }
  if (op === 'is') return { kind: 'is', type: c.entity_type as string };
  return null;
}

function parseAction(c: AnyExpr): VisualPolicy['action'] | null {
  const op = c.op as string;
  if (op === 'All') return { kind: 'all' };
  if (op === '==') {
    const e = entityFromConstraint(c);
    if (!e) return null;
    return { kind: 'eq', id: e.id };
  }
  if (op === 'in') {
    if (Array.isArray(c.entities)) {
      const ids = (c.entities as { type?: string; id?: string; __entity?: { id?: string } }[]).map(
        (en) => en.id ?? en.__entity?.id ?? '',
      );
      return { kind: 'in', ids };
    }
    if (c.entity) {
      const e = entityFromConstraint(c);
      if (!e) return null;
      return { kind: 'in', ids: [e.id] };
    }
  }
  return null;
}

function parseResource(c: AnyExpr): VisualPolicy['resource'] | null {
  const op = c.op as string;
  if (op === 'All') return { kind: 'all' };
  if (op === '==') {
    const e = entityFromConstraint(c);
    if (!e) return null;
    return { kind: 'eq', entity: e };
  }
  if (op === 'is') return { kind: 'is', type: c.entity_type as string };
  return null;
}

function entityFromConstraint(c: AnyExpr): { type: string; id: string } | null {
  const e = c.entity as AnyExpr | undefined;
  if (!e) return null;
  // EntityUidJson = { __entity: { type, id } } | { type, id }
  const inner = (e.__entity as AnyExpr | undefined) ?? e;
  const type = inner.type as string | undefined;
  const id = inner.id as string | undefined;
  if (!type || !id) return null;
  return { type, id };
}

/* ------------------------------------------------------------------ */
/* Clause expression matching                                          */
/* ------------------------------------------------------------------ */

function parseClause(expr: AnyExpr): Clause {
  // single-attr eq: { "==": { left: <path>, right: { Value: scalar } } }
  const eq = expr['=='] as { left: AnyExpr; right: AnyExpr } | undefined;
  if (eq) {
    const path = pathFromExpr(eq.left);
    const lit = literalFromExpr(eq.right);
    if (path && lit !== undefined) return { kind: 'attr_eq', path, value: lit };
  }

  // attr_in: { in: { left: <path>, right: { Set: [{Value:..}, ...] } } }
  const inOp = expr.in as { left: AnyExpr; right: AnyExpr } | undefined;
  if (inOp) {
    const path = pathFromExpr(inOp.left);
    const set = inOp.right.Set as AnyExpr[] | undefined;
    if (path && Array.isArray(set)) {
      const values: ScalarLiteral[] = [];
      let allLits = true;
      for (const item of set) {
        const v = literalFromExpr(item);
        if (v === undefined) {
          allLits = false;
          break;
        }
        values.push(v);
      }
      if (allLits) return { kind: 'attr_in', path, values };
    }
  }

  // numeric_cmp: { "<"|"<="|">"|">=": { left: <path>, right: { Value: number } } }
  for (const op of ['<', '<=', '>', '>='] as const) {
    const cmp = expr[op] as { left: AnyExpr; right: AnyExpr } | undefined;
    if (cmp) {
      const path = pathFromExpr(cmp.left);
      const v = literalFromExpr(cmp.right);
      if (path && typeof v === 'number') {
        return { kind: 'numeric_cmp', op, path, value: v };
      }
    }
  }

  // time_window: { "&&": { left: <path> >= n, right: <path> < m } } same path
  const and = expr['&&'] as { left: AnyExpr; right: AnyExpr } | undefined;
  if (and) {
    const lo = parseClause(and.left);
    const hi = parseClause(and.right);
    if (
      lo.kind === 'numeric_cmp' &&
      lo.op === '>=' &&
      hi.kind === 'numeric_cmp' &&
      hi.op === '<' &&
      lo.path === hi.path
    ) {
      return {
        kind: 'time_window_hour',
        path: lo.path,
        startHour: lo.value,
        endHour: hi.value,
      };
    }
  }

  // has-only: { has: { left: <var-or-path>, attr: "x" } }
  const has = expr.has as { left: AnyExpr; attr: string } | undefined;
  if (has) {
    const left = pathFromExpr(has.left);
    if (left !== null) return { kind: 'has_attr', path: `${left}.${has.attr}` };
    const v = (has.left as AnyExpr).Var as string | undefined;
    if (v) return { kind: 'has_attr', path: `${v}.${has.attr}` };
  }

  return { kind: 'raw', cedar: '/* see Cedar tab */' };
}

function pathFromExpr(expr: AnyExpr): string | null {
  // A `.` access chain over a Var: { ".": { left: ..., attr: "x" } }
  const v = expr.Var as string | undefined;
  if (v) return v;
  const dot = expr['.'] as { left: AnyExpr; attr: string } | undefined;
  if (!dot) return null;
  const left = pathFromExpr(dot.left);
  if (left === null) return null;
  return `${left}.${dot.attr}`;
}

function literalFromExpr(expr: AnyExpr): ScalarLiteral | undefined {
  const v = expr.Value;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return v;
  }
  return undefined;
}
