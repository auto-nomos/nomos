import { parseGoogleCalendarPath } from '@auto-nomos/schema-packs/google_calendar/path';
import type { GoogleCalendarConstraint } from '@auto-nomos/shared-types';

export type GoogleCalendarAdapterFailure =
  | 'calendar_mismatch'
  | 'event_mismatch'
  | 'unparseable_path';

export type GoogleCalendarAdapterResult =
  | { ok: true }
  | { ok: false; reason: GoogleCalendarAdapterFailure };

export interface GoogleCalendarProxyCall {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
}

export function validateGoogleCalendarProxyCall(
  constraint: GoogleCalendarConstraint,
  apiCall: GoogleCalendarProxyCall,
): GoogleCalendarAdapterResult {
  const parsed = parseGoogleCalendarPath(apiCall.path);
  if (!parsed) return { ok: false, reason: 'unparseable_path' };
  if (constraint.calendar_id !== undefined && parsed.calendar_id !== constraint.calendar_id) {
    return { ok: false, reason: 'calendar_mismatch' };
  }
  if (constraint.event_id !== undefined && parsed.event_id !== constraint.event_id) {
    return { ok: false, reason: 'event_mismatch' };
  }
  return { ok: true };
}
