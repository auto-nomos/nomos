import { parseGoogleSheetsPath } from '@auto-nomos/schema-packs/google_sheets/path';
import type { GoogleSheetsConstraint } from '@auto-nomos/shared-types';

export type GoogleSheetsAdapterFailure =
  | 'spreadsheet_mismatch'
  | 'sheet_mismatch'
  | 'range_mismatch'
  | 'unparseable_path';

export type GoogleSheetsAdapterResult =
  | { ok: true }
  | { ok: false; reason: GoogleSheetsAdapterFailure };

export interface GoogleSheetsProxyCall {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
}

export function validateGoogleSheetsProxyCall(
  constraint: GoogleSheetsConstraint,
  apiCall: GoogleSheetsProxyCall,
): GoogleSheetsAdapterResult {
  const parsed = parseGoogleSheetsPath(apiCall.path);
  if (!parsed) return { ok: false, reason: 'unparseable_path' };
  if (
    constraint.spreadsheet_id !== undefined &&
    parsed.spreadsheet_id !== constraint.spreadsheet_id
  ) {
    return { ok: false, reason: 'spreadsheet_mismatch' };
  }
  if (constraint.range !== undefined && parsed.range !== constraint.range) {
    return { ok: false, reason: 'range_mismatch' };
  }
  // sheet_id is body-only on most endpoints; enforce when present in body.
  if (constraint.sheet_id !== undefined) {
    const body =
      apiCall.body && typeof apiCall.body === 'object' && !Array.isArray(apiCall.body)
        ? (apiCall.body as Record<string, unknown>)
        : undefined;
    const sheetId = typeof body?.sheetId === 'string' ? body.sheetId : undefined;
    if (sheetId !== constraint.sheet_id) {
      return { ok: false, reason: 'sheet_mismatch' };
    }
  }
  return { ok: true };
}
