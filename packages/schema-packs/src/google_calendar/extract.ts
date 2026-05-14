import { parseGoogleCalendarPath } from './path.js';

export function extractResourceFromApiCall(
  _command: string,
  apiCall: { method: string; path: string },
): Record<string, unknown> | null {
  const parsed = parseGoogleCalendarPath(apiCall.path);
  if (!parsed) return null;
  const out: Record<string, unknown> = {};
  if (parsed.calendar_id) out.calendar_id = parsed.calendar_id;
  if (parsed.event_id) out.event_id = parsed.event_id;
  return Object.keys(out).length === 0 ? null : out;
}
