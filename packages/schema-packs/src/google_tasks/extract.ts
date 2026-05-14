import { parseGoogleTasksPath } from './path.js';

export function extractResourceFromApiCall(
  _command: string,
  apiCall: { method: string; path: string },
): Record<string, unknown> | null {
  const parsed = parseGoogleTasksPath(apiCall.path);
  if (!parsed) return null;
  const out: Record<string, unknown> = {};
  if (parsed.tasklist_id) out.tasklist_id = parsed.tasklist_id;
  if (parsed.task_id) out.task_id = parsed.task_id;
  return Object.keys(out).length === 0 ? null : out;
}
