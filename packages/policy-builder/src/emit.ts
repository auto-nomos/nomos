/**
 * IR → Cedar text emitter.
 *
 * The output goes back through `cedar-wasm.parsePolicy` (via the
 * existing `policies.preview` tRPC query) before save — that's the
 * round-trip safety net. This emitter MUST produce parseable Cedar;
 * if it ever doesn't, the test in `__tests__/roundtrip.test.ts`
 * fails and the offending shape gets a fix here.
 */
import type {
  ActionConstraint,
  Clause,
  Condition,
  PrincipalConstraint,
  ResourceConstraint,
  ScalarLiteral,
  VisualPolicy,
} from './ir.js';

export function emitPolicySet(policies: VisualPolicy[]): string {
  return policies.map(emitPolicy).join('\n\n');
}

export function emitPolicy(p: VisualPolicy): string {
  const ann = p.annotations
    ? Object.entries(p.annotations)
        .map(([k, v]) => `@${k}(${quoteString(v)})`)
        .join('\n')
    : '';
  const head = `${p.effect} (\n  ${emitPrincipal(p.principal)},\n  ${emitAction(p.action)},\n  ${emitResource(p.resource)}\n)`;
  const conds = p.conditions.map(emitCondition).join('\n');
  const body = conds.length > 0 ? `${head}\n${conds};` : `${head};`;
  return ann.length > 0 ? `${ann}\n${body}` : body;
}

function emitPrincipal(c: PrincipalConstraint): string {
  switch (c.kind) {
    case 'all':
      return 'principal';
    case 'eq':
      return `principal == ${emitEntity(c.entity.type, c.entity.id)}`;
    case 'is':
      return `principal is ${c.type}`;
  }
}

function emitAction(c: ActionConstraint): string {
  switch (c.kind) {
    case 'all':
      return 'action';
    case 'eq':
      return `action == Action::${quoteString(c.id)}`;
    case 'in':
      return `action in [${c.ids.map((id) => `Action::${quoteString(id)}`).join(', ')}]`;
  }
}

function emitResource(c: ResourceConstraint): string {
  switch (c.kind) {
    case 'all':
      return 'resource';
    case 'eq':
      return `resource == ${emitEntity(c.entity.type, c.entity.id)}`;
    case 'is':
      return `resource is ${c.type}`;
  }
}

function emitCondition(c: Condition): string {
  return `${c.kind} { ${emitClause(c.clause)} }`;
}

export function emitClause(c: Clause): string {
  switch (c.kind) {
    case 'attr_eq':
      return `${c.path} == ${emitLiteral(c.value)}`;
    case 'attr_in':
      return `${c.path} in [${c.values.map(emitLiteral).join(', ')}]`;
    case 'numeric_cmp':
      return `${c.path} ${c.op} ${c.value}`;
    case 'time_window_hour':
      // expanded form so PDP doesn't need a Cedar extension
      return `${c.path} >= ${c.startHour} && ${c.path} < ${c.endHour}`;
    case 'has_attr':
      return emitHasAttr(c.path);
    case 'raw':
      return c.cedar;
  }
}

function emitHasAttr(path: string): string {
  // `context.user.dept` -> `context has user && context.user has dept`
  const parts = path.split('.');
  if (parts.length < 2) return `${path}`;
  const head = parts[0] as string;
  const out: string[] = [];
  let acc = head;
  for (let i = 1; i < parts.length; i++) {
    out.push(`${acc} has ${parts[i]}`);
    acc = `${acc}.${parts[i]}`;
  }
  return out.join(' && ');
}

function emitEntity(type: string, id: string): string {
  return `${type}::${quoteString(id)}`;
}

function emitLiteral(v: ScalarLiteral): string {
  if (typeof v === 'string') return quoteString(v);
  if (typeof v === 'number') return String(v);
  return v ? 'true' : 'false';
}

function quoteString(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
