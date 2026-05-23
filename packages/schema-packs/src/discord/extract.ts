import { parseDiscordPath } from './path.js';

/**
 * Derive effective resource keys from a Discord proxy call. Compared by
 * `validateResourceConsistency` against the agent-declared `request.resource`.
 *
 * Discord puts every identifier in the URL path. We surface `guild_id`,
 * `channel_id`, `message_id`, `role_id`, `user_id` so a UCAN scoped to one
 * guild/channel cannot be smuggled to a different one via apiCall.
 */
export function extractResourceFromApiCall(
  _command: string,
  apiCall: { method: string; path: string; body?: unknown; query?: Record<string, string> },
): Record<string, unknown> | null {
  const parsed = parseDiscordPath(apiCall.path);
  if (!parsed) return null;
  const out: Record<string, unknown> = {};
  if (parsed.guild_id) out.guild_id = parsed.guild_id;
  if (parsed.channel_id) out.channel_id = parsed.channel_id;
  if (parsed.message_id) out.message_id = parsed.message_id;
  if (parsed.role_id) out.role_id = parsed.role_id;
  if (parsed.user_id) out.user_id = parsed.user_id;
  return out;
}
