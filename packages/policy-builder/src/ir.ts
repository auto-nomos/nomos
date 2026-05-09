/**
 * Visual policy IR.
 *
 * Narrow, intentional subset of Cedar expressed as a tagged-union tree.
 * Round-trips losslessly only for the shapes the visual builder supports;
 * anything else parses as `Unrepresentable` and the dashboard renders the
 * "edit in Cedar" fallback.
 */

export type Effect = 'permit' | 'forbid';

export interface EntityRef {
  /** Cedar entity type, e.g. "Agent", "Resource", "GitHub::Repo". */
  type: string;
  /** Entity id literal. */
  id: string;
}

export type PrincipalConstraint =
  | { kind: 'all' }
  | { kind: 'eq'; entity: EntityRef }
  | { kind: 'is'; type: string };

export type ActionConstraint =
  | { kind: 'all' }
  | { kind: 'eq'; id: string }
  | { kind: 'in'; ids: string[] };

export type ResourceConstraint =
  | { kind: 'all' }
  | { kind: 'eq'; entity: EntityRef }
  | { kind: 'is'; type: string };

/**
 * Supported clause shapes inside a `when` / `unless`.
 *
 * Add a new shape by:
 *   1. extending this union
 *   2. handling it in `emitClause()` (emit.ts)
 *   3. adding a recognizer in `parseClauseExpr()` (parse.ts)
 *   4. adding a round-trip test for the new shape
 */
export type Clause =
  | { kind: 'attr_eq'; path: string; value: ScalarLiteral }
  | { kind: 'attr_in'; path: string; values: ScalarLiteral[] }
  | { kind: 'numeric_cmp'; op: '<' | '<=' | '>' | '>='; path: string; value: number }
  | { kind: 'time_window_hour'; path: string; startHour: number; endHour: number }
  | { kind: 'has_attr'; path: string }
  | { kind: 'raw'; cedar: string };

export type ScalarLiteral = string | number | boolean;

export interface Condition {
  kind: 'when' | 'unless';
  clause: Clause;
}

export interface VisualPolicy {
  /** Stable id used by React Flow; not persisted in Cedar. */
  id: string;
  effect: Effect;
  principal: PrincipalConstraint;
  action: ActionConstraint;
  resource: ResourceConstraint;
  conditions: Condition[];
  annotations?: Record<string, string>;
  /** Optional short name surfaced in the canvas; not part of Cedar text. */
  label?: string;
}

/**
 * Result of parsing a Cedar policy set into the visual IR.
 *
 * `policies` only contains the policies that fit the IR exactly.
 * Anything we couldn't model lands in `unrepresentable` so the dashboard
 * can render the "this policy is too complex for the visual builder"
 * banner without losing the user's source.
 */
export interface ParseToIrResult {
  policies: VisualPolicy[];
  unrepresentable: { reason: string; cedar: string }[];
}
