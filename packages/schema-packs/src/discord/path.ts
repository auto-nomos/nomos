/**
 * Parse the Discord API path (e.g. `/guilds/{guild_id}/channels`,
 * `/channels/{channel_id}/messages/{message_id}`,
 * `/guilds/{guild_id}/members/{user_id}/roles/{role_id}`) and surface the
 * identifiers that appear as path segments. Returns null when the path
 * doesn't match any known Discord shape — caller treats null as
 * "unparseable" and skips the resource-mismatch check for that call.
 *
 * Discord puts every resource id in the URL (unlike Slack which uses the
 * body), so we don't need to inspect query/body — but we accept those args
 * to keep the signature parallel with the slack extractor.
 */
export function parseDiscordPath(path: string): {
  guild_id?: string;
  channel_id?: string;
  message_id?: string;
  role_id?: string;
  user_id?: string;
  overwrite_id?: string;
} | null {
  if (!path.startsWith('/')) return null;
  const head = path.split('?')[0]!;
  const segs = head.split('/').filter(Boolean);
  if (segs.length === 0) return null;

  const out: ReturnType<typeof parseDiscordPath> = {};

  // /guilds/{guild_id}[/...]
  if (segs[0] === 'guilds' && segs[1]) {
    out!.guild_id = segs[1];
    // /guilds/{guild_id}/members/{user_id}[/roles/{role_id}]
    if (segs[2] === 'members' && segs[3]) {
      out!.user_id = segs[3];
      if (segs[4] === 'roles' && segs[5]) out!.role_id = segs[5];
      return out;
    }
    // /guilds/{guild_id}/roles[/{role_id}]
    if (segs[2] === 'roles') {
      if (segs[3]) out!.role_id = segs[3];
      return out;
    }
    // /guilds/{guild_id}/channels  (list/create)
    // /guilds/{guild_id}/emojis    (list)
    return out;
  }

  // /channels/{channel_id}[/...]
  if (segs[0] === 'channels' && segs[1]) {
    out!.channel_id = segs[1];
    // /channels/{channel_id}/messages/{message_id}
    if (segs[2] === 'messages' && segs[3]) {
      out!.message_id = segs[3];
      return out;
    }
    // /channels/{channel_id}/permissions/{overwrite_id}
    if (segs[2] === 'permissions' && segs[3]) {
      out!.overwrite_id = segs[3];
      return out;
    }
    // /channels/{channel_id}/messages
    // /channels/{channel_id}/invites
    // /channels/{channel_id}/webhooks
    return out;
  }

  return null;
}
