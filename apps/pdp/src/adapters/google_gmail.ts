import { parseGoogleGmailPath } from '@auto-nomos/schema-packs/google_gmail/path';
import type { GoogleGmailConstraint } from '@auto-nomos/shared-types';

export type GoogleGmailAdapterFailure =
  | 'user_mismatch'
  | 'message_mismatch'
  | 'thread_mismatch'
  | 'label_mismatch'
  | 'unparseable_path';

export type GoogleGmailAdapterResult =
  | { ok: true }
  | { ok: false; reason: GoogleGmailAdapterFailure };

export interface GoogleGmailProxyCall {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
}

export function validateGoogleGmailProxyCall(
  constraint: GoogleGmailConstraint,
  apiCall: GoogleGmailProxyCall,
): GoogleGmailAdapterResult {
  const parsed = parseGoogleGmailPath(apiCall.path);
  if (!parsed) return { ok: false, reason: 'unparseable_path' };
  if (constraint.user_id !== undefined && parsed.user_id !== constraint.user_id) {
    return { ok: false, reason: 'user_mismatch' };
  }
  if (constraint.message_id !== undefined && parsed.message_id !== constraint.message_id) {
    return { ok: false, reason: 'message_mismatch' };
  }
  if (constraint.thread_id !== undefined && parsed.thread_id !== constraint.thread_id) {
    return { ok: false, reason: 'thread_mismatch' };
  }
  if (constraint.label_id !== undefined && parsed.label_id !== constraint.label_id) {
    return { ok: false, reason: 'label_mismatch' };
  }
  return { ok: true };
}
