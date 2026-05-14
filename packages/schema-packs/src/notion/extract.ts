import { normaliseNotionId, parseNotionPath } from './path.js';

/**
 * Surface page_id / database_id / block_id from a notion proxy call so
 * the resource-consistency gate can compare against the declared
 * resource. Ids are stripped of dashes so a UCAN granting access to
 * `ab1c…` (32-char) and an apiCall using the dashed form (`ab1c-…-…`)
 * compare equal.
 */
export function extractResourceFromApiCall(
  _command: string,
  apiCall: { method: string; path: string },
): Record<string, unknown> | null {
  const parsed = parseNotionPath(apiCall.path);
  if (!parsed) return null;
  const out: Record<string, unknown> = {};
  if (parsed.page_id) out.page_id = normaliseNotionId(parsed.page_id);
  if (parsed.database_id) out.database_id = normaliseNotionId(parsed.database_id);
  if (parsed.block_id) out.block_id = normaliseNotionId(parsed.block_id);
  return Object.keys(out).length === 0 ? null : out;
}
