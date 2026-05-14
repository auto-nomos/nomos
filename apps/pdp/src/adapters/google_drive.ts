/**
 * Google Drive data-plane gate. Re-derives `file_id`/`permission_id`
 * from `apiCall.path` and rejects calls outside the `GoogleDriveConstraint`.
 * `folder_id` and `drive_id` come from body/query — we inspect both.
 */
import { parseGoogleDrivePath } from '@auto-nomos/schema-packs/google/path';
import type { GoogleDriveConstraint } from '@auto-nomos/shared-types';

export type GoogleDriveAdapterFailure =
  | 'file_mismatch'
  | 'folder_mismatch'
  | 'drive_mismatch'
  | 'permission_mismatch'
  | 'path_outside_constraint'
  | 'unparseable_path';

export type GoogleDriveAdapterResult =
  | { ok: true }
  | { ok: false; reason: GoogleDriveAdapterFailure };

export interface GoogleDriveProxyCall {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
}

export function validateGoogleDriveProxyCall(
  constraint: GoogleDriveConstraint,
  apiCall: GoogleDriveProxyCall,
): GoogleDriveAdapterResult {
  const parsed = parseGoogleDrivePath(apiCall.path);
  if (!parsed) return { ok: false, reason: 'unparseable_path' };
  if (constraint.file_id !== undefined && parsed.file_id !== constraint.file_id) {
    return { ok: false, reason: 'file_mismatch' };
  }
  const body =
    apiCall.body && typeof apiCall.body === 'object' && !Array.isArray(apiCall.body)
      ? (apiCall.body as Record<string, unknown>)
      : undefined;
  if (constraint.folder_id !== undefined) {
    const parents = body?.parents;
    if (!Array.isArray(parents) || !parents.includes(constraint.folder_id)) {
      // Pin to a folder; create/copy calls supply parents in body.
      return { ok: false, reason: 'folder_mismatch' };
    }
  }
  if (constraint.drive_id !== undefined) {
    const driveId =
      apiCall.query?.driveId ?? (typeof body?.driveId === 'string' ? body.driveId : undefined);
    if (driveId !== constraint.drive_id) {
      return { ok: false, reason: 'drive_mismatch' };
    }
  }
  if (constraint.path_prefix !== undefined && !apiCall.path.startsWith(constraint.path_prefix)) {
    return { ok: false, reason: 'path_outside_constraint' };
  }
  return { ok: true };
}
