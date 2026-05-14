import { parseGoogleDrivePath } from './path.js';

/**
 * Drive resource keys: `file_id` is the only identifier the URL exposes;
 * folder/drive ids live in body or query. We surface `file_id` plus
 * `permission_id` when relevant — together they pin a single sharing
 * grant so a UCAN scoped to file A cannot revoke a permission on file B.
 */
export function extractResourceFromApiCall(
  _command: string,
  apiCall: { method: string; path: string },
): Record<string, unknown> | null {
  const parsed = parseGoogleDrivePath(apiCall.path);
  if (!parsed) return null;
  const out: Record<string, unknown> = {};
  if (parsed.file_id) out.file_id = parsed.file_id;
  if (parsed.permission_id) out.permission_id = parsed.permission_id;
  return Object.keys(out).length === 0 ? null : out;
}
