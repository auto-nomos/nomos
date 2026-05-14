/**
 * Notion data-plane gate. Re-derives `page_id`/`database_id`/`block_id`
 * from `apiCall.path` and rejects calls outside the `NotionConstraint`.
 * UUIDs are dash-normalised before equality — notion accepts both
 * 32-char and 36-char forms.
 */
import { normaliseNotionId, parseNotionPath } from '@auto-nomos/schema-packs/notion/path';
import type { NotionConstraint } from '@auto-nomos/shared-types';

export type NotionAdapterFailure =
  | 'page_mismatch'
  | 'database_mismatch'
  | 'block_mismatch'
  | 'workspace_mismatch'
  | 'unparseable_path';

export type NotionAdapterResult = { ok: true } | { ok: false; reason: NotionAdapterFailure };

export interface NotionProxyCall {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
}

function eq(a: string | undefined, b: string | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return normaliseNotionId(a) === normaliseNotionId(b);
}

export function validateNotionProxyCall(
  constraint: NotionConstraint,
  apiCall: NotionProxyCall,
): NotionAdapterResult {
  const parsed = parseNotionPath(apiCall.path);
  if (!parsed) return { ok: false, reason: 'unparseable_path' };
  if (constraint.page_id !== undefined && !eq(parsed.page_id, constraint.page_id)) {
    return { ok: false, reason: 'page_mismatch' };
  }
  if (constraint.database_id !== undefined && !eq(parsed.database_id, constraint.database_id)) {
    return { ok: false, reason: 'database_mismatch' };
  }
  if (constraint.block_id !== undefined && !eq(parsed.block_id, constraint.block_id)) {
    return { ok: false, reason: 'block_mismatch' };
  }
  // workspace_id is connection-scoped (Notion token is single-workspace).
  return { ok: true };
}
