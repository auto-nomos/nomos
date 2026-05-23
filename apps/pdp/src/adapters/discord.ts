/**
 * Discord data-plane gate. Sits between `decide()` (UCAN + policy) and
 * `oauth.ts`'s discord proxy. Re-derives the target guild/channel/
 * message/role/user from `apiCall.path` and rejects any call outside the
 * `DiscordConstraint`.
 *
 * Discord puts every identifier in the URL path. Without this gate an
 * agent holding a UCAN scoped to guild A could call
 * `POST /guilds/<B>/channels` and the connector (which auths with the
 * static bot token) would obey — the bot is installed into both guilds.
 *
 * The static bot token already pins the install set per app, but a
 * single Discord application can be installed into multiple guilds, so
 * the constraint provides per-UCAN narrowing on top of that.
 */
import { parseDiscordPath } from '@auto-nomos/schema-packs/discord/path';
import type { DiscordConstraint } from '@auto-nomos/shared-types';

export type DiscordAdapterFailure =
  | 'guild_mismatch'
  | 'channel_mismatch'
  | 'message_mismatch'
  | 'role_mismatch'
  | 'user_mismatch'
  | 'unparseable_path';

export type DiscordAdapterResult = { ok: true } | { ok: false; reason: DiscordAdapterFailure };

export interface DiscordProxyCall {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
}

export function validateDiscordProxyCall(
  constraint: DiscordConstraint,
  apiCall: DiscordProxyCall,
): DiscordAdapterResult {
  const parsed = parseDiscordPath(apiCall.path);
  if (!parsed) return { ok: false, reason: 'unparseable_path' };
  if (constraint.guild_id !== undefined) {
    if (parsed.guild_id !== constraint.guild_id) {
      return { ok: false, reason: 'guild_mismatch' };
    }
  }
  if (constraint.channel_id !== undefined) {
    if (parsed.channel_id !== constraint.channel_id) {
      return { ok: false, reason: 'channel_mismatch' };
    }
  }
  if (constraint.message_id !== undefined) {
    if (parsed.message_id !== constraint.message_id) {
      return { ok: false, reason: 'message_mismatch' };
    }
  }
  if (constraint.role_id !== undefined) {
    if (parsed.role_id !== constraint.role_id) {
      return { ok: false, reason: 'role_mismatch' };
    }
  }
  if (constraint.user_id !== undefined) {
    if (parsed.user_id !== constraint.user_id) {
      return { ok: false, reason: 'user_mismatch' };
    }
  }
  return { ok: true };
}
