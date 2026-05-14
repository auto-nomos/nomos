import { parseGoogleTasksPath } from '@auto-nomos/schema-packs/google_tasks/path';
import type { GoogleTasksConstraint } from '@auto-nomos/shared-types';

export type GoogleTasksAdapterFailure = 'tasklist_mismatch' | 'task_mismatch' | 'unparseable_path';
export type GoogleTasksAdapterResult =
  | { ok: true }
  | { ok: false; reason: GoogleTasksAdapterFailure };

export interface GoogleTasksProxyCall {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
}

export function validateGoogleTasksProxyCall(
  constraint: GoogleTasksConstraint,
  apiCall: GoogleTasksProxyCall,
): GoogleTasksAdapterResult {
  const parsed = parseGoogleTasksPath(apiCall.path);
  if (!parsed) return { ok: false, reason: 'unparseable_path' };
  if (constraint.tasklist_id !== undefined && parsed.tasklist_id !== constraint.tasklist_id) {
    return { ok: false, reason: 'tasklist_mismatch' };
  }
  if (constraint.task_id !== undefined && parsed.task_id !== constraint.task_id) {
    return { ok: false, reason: 'task_mismatch' };
  }
  return { ok: true };
}
