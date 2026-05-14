import { parseGoogleGmailPath } from './path.js';

export function extractResourceFromApiCall(
  _command: string,
  apiCall: { method: string; path: string },
): Record<string, unknown> | null {
  const parsed = parseGoogleGmailPath(apiCall.path);
  if (!parsed) return null;
  const out: Record<string, unknown> = {};
  if (parsed.user_id) out.user_id = parsed.user_id;
  if (parsed.message_id) out.message_id = parsed.message_id;
  if (parsed.thread_id) out.thread_id = parsed.thread_id;
  if (parsed.label_id) out.label_id = parsed.label_id;
  return Object.keys(out).length === 0 ? null : out;
}
