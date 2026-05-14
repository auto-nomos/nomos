import { parseGoogleSheetsPath } from './path.js';

export function extractResourceFromApiCall(
  _command: string,
  apiCall: { method: string; path: string },
): Record<string, unknown> | null {
  const parsed = parseGoogleSheetsPath(apiCall.path);
  if (!parsed) return null;
  const out: Record<string, unknown> = {};
  if (parsed.spreadsheet_id) out.spreadsheet_id = parsed.spreadsheet_id;
  if (parsed.range) out.range = parsed.range;
  return Object.keys(out).length === 0 ? null : out;
}
