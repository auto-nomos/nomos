import { parseSlackPath } from './path.js';

/**
 * Derive effective resource keys from a slack proxy call. Compared by
 * `validateResourceConsistency` against the agent-declared `request.resource`.
 *
 * Slack puts identifiers mostly in body/query, not URL. We surface
 * `channel_id`, `user_id`, `thread_ts` so a UCAN scoped to one channel
 * cannot be smuggled to a different channel via apiCall.
 */
export function extractResourceFromApiCall(
  _command: string,
  apiCall: { method: string; path: string; body?: unknown; query?: Record<string, string> },
): Record<string, unknown> | null {
  const parsed = parseSlackPath(apiCall.path, apiCall.query, apiCall.body);
  if (!parsed) return null;
  const out: Record<string, unknown> = {};
  if (parsed.channel_id) out.channel_id = parsed.channel_id;
  if (parsed.user_id) out.user_id = parsed.user_id;
  if (parsed.thread_ts) out.thread_ts = parsed.thread_ts;
  return out;
}
