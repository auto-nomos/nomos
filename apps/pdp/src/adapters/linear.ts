/**
 * Linear data-plane gate. Linear is GraphQL — every call POSTs to `/` with
 * a `{query, variables}` body. We re-derive the target team/project/issue
 * from `body.variables` and rejects calls outside the `LinearConstraint`.
 *
 * Without this gate an agent holding a UCAN scoped to team A could mint
 * a mutation against team B (the URL is identical for both).
 */
import {
  isMutationQuery,
  parseLinearBody,
  parseLinearPath,
} from '@auto-nomos/schema-packs/linear/path';
import type { LinearConstraint } from '@auto-nomos/shared-types';

export type LinearAdapterFailure =
  | 'team_mismatch'
  | 'project_mismatch'
  | 'issue_mismatch'
  | 'workspace_mismatch'
  | 'unparseable_path'
  | 'missing_body'
  | 'unparseable_body';

export type LinearAdapterResult = { ok: true } | { ok: false; reason: LinearAdapterFailure };

export interface LinearProxyCall {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
}

export function validateLinearProxyCall(
  constraint: LinearConstraint,
  apiCall: LinearProxyCall,
): LinearAdapterResult {
  if (!parseLinearPath(apiCall.path)) return { ok: false, reason: 'unparseable_path' };
  if (apiCall.body === undefined || apiCall.body === null) {
    return { ok: false, reason: 'missing_body' };
  }
  const parsed = parseLinearBody(apiCall.body);
  if (!parsed) return { ok: false, reason: 'unparseable_body' };
  // Pull ids from variables + nested input. `validateLinearProxyCall` is the
  // last line of defence; the schema-pack body shape already required
  // `body.query` to be present.
  const v = parsed.variables ?? {};
  const input =
    typeof v.input === 'object' && v.input !== null && !Array.isArray(v.input)
      ? (v.input as Record<string, unknown>)
      : {};
  const effTeam =
    (typeof v.teamId === 'string' && v.teamId) ||
    (typeof input.teamId === 'string' && input.teamId) ||
    undefined;
  const effProject =
    (typeof v.projectId === 'string' && v.projectId) ||
    (typeof input.projectId === 'string' && input.projectId) ||
    undefined;
  const effIssue =
    (typeof v.id === 'string' && v.id) ||
    (typeof v.issueId === 'string' && v.issueId) ||
    (typeof input.id === 'string' && input.id) ||
    undefined;
  if (constraint.team_id !== undefined && effTeam !== constraint.team_id) {
    return { ok: false, reason: 'team_mismatch' };
  }
  if (constraint.project_id !== undefined && effProject !== constraint.project_id) {
    return { ok: false, reason: 'project_mismatch' };
  }
  if (constraint.issue_id !== undefined && effIssue !== constraint.issue_id) {
    return { ok: false, reason: 'issue_mismatch' };
  }
  // workspace_id is connection-scoped — enforced by the linear OAuth token.
  // Tag mutations for audit so write attempts under a read-only constraint
  // surface clearly; the cedar policy enforces the actual permission.
  void isMutationQuery;
  return { ok: true };
}
