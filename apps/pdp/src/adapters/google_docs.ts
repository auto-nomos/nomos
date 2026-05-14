import { parseGoogleDocsPath } from '@auto-nomos/schema-packs/google_docs/path';
import type { GoogleDocsConstraint } from '@auto-nomos/shared-types';

export type GoogleDocsAdapterFailure = 'document_mismatch' | 'unparseable_path';
export type GoogleDocsAdapterResult =
  | { ok: true }
  | { ok: false; reason: GoogleDocsAdapterFailure };

export interface GoogleDocsProxyCall {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
}

export function validateGoogleDocsProxyCall(
  constraint: GoogleDocsConstraint,
  apiCall: GoogleDocsProxyCall,
): GoogleDocsAdapterResult {
  const parsed = parseGoogleDocsPath(apiCall.path);
  if (!parsed) return { ok: false, reason: 'unparseable_path' };
  if (constraint.document_id !== undefined && parsed.document_id !== constraint.document_id) {
    return { ok: false, reason: 'document_mismatch' };
  }
  return { ok: true };
}
