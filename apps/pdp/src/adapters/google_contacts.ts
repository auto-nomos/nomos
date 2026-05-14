import { parseGoogleContactsPath } from '@auto-nomos/schema-packs/google_contacts/path';
import type { GoogleContactsConstraint } from '@auto-nomos/shared-types';

export type GoogleContactsAdapterFailure = 'resource_name_mismatch' | 'unparseable_path';
export type GoogleContactsAdapterResult =
  | { ok: true }
  | { ok: false; reason: GoogleContactsAdapterFailure };

export interface GoogleContactsProxyCall {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
}

export function validateGoogleContactsProxyCall(
  constraint: GoogleContactsConstraint,
  apiCall: GoogleContactsProxyCall,
): GoogleContactsAdapterResult {
  const parsed = parseGoogleContactsPath(apiCall.path);
  if (!parsed) return { ok: false, reason: 'unparseable_path' };
  if (constraint.resource_name !== undefined && parsed.resource_name !== constraint.resource_name) {
    return { ok: false, reason: 'resource_name_mismatch' };
  }
  return { ok: true };
}
