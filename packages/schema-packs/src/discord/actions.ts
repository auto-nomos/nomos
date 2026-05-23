/**
 * Mapping from `packages/adapters/spec/discord.yaml` action ids to canonical
 * Cedar commands. See `../github/actions.ts` for the design rationale.
 */

export const actionToCommand: Record<string, string> = {
  // Guild
  get_guild: '/discord/guild/read',
  list_guild_members: '/discord/guild/members',
  modify_guild: '/discord/guild/modify',
  // Channel
  list_channels: '/discord/channel/list',
  get_channel: '/discord/channel/read',
  create_channel: '/discord/channel/create',
  modify_channel: '/discord/channel/modify',
  delete_channel: '/discord/channel/delete',
  set_channel_permissions: '/discord/channel/permissions',
  // Message
  list_messages: '/discord/message/list',
  post_message: '/discord/message/post',
  edit_message: '/discord/message/edit',
  delete_message: '/discord/message/delete',
  // Role
  list_roles: '/discord/role/list',
  create_role: '/discord/role/create',
  modify_role: '/discord/role/modify',
  delete_role: '/discord/role/delete',
  // Member
  add_member_role: '/discord/member/add_role',
  remove_member_role: '/discord/member/remove_role',
  // Invite
  create_invite: '/discord/invite/create',
  // Webhook
  create_webhook: '/discord/webhook/create',
  // Emoji
  list_emojis: '/discord/emoji/list',
};

/**
 * Surface the path/body identifiers the PDP resource-mismatch check compares
 * against the agent-declared `request.resource`. Discord ids live in the URL
 * path (`/guilds/{guild_id}/channels/{channel_id}/...`); the schema-pack
 * `extract.ts` parses them from the apiCall — this helper is used by SDK +
 * UI when building the declared resource object.
 */
export function resourceFor(
  actionId: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const guild_id = typeof params.guild_id === 'string' ? params.guild_id : undefined;
  const channel_id = typeof params.channel_id === 'string' ? params.channel_id : undefined;
  const message_id = typeof params.message_id === 'string' ? params.message_id : undefined;
  const role_id = typeof params.role_id === 'string' ? params.role_id : undefined;
  const user_id = typeof params.user_id === 'string' ? params.user_id : undefined;

  switch (actionId) {
    case 'get_guild':
    case 'list_guild_members':
    case 'modify_guild':
    case 'list_channels':
    case 'list_roles':
    case 'create_role':
    case 'list_emojis':
      return guild_id ? { guild_id } : {};
    case 'create_channel':
      return guild_id ? { guild_id } : {};
    case 'get_channel':
    case 'modify_channel':
    case 'delete_channel':
    case 'list_messages':
    case 'post_message':
    case 'set_channel_permissions':
    case 'create_invite':
    case 'create_webhook':
      return channel_id ? { channel_id } : {};
    case 'edit_message':
    case 'delete_message':
      return {
        ...(channel_id ? { channel_id } : {}),
        ...(message_id ? { message_id } : {}),
      };
    case 'modify_role':
    case 'delete_role':
      return {
        ...(guild_id ? { guild_id } : {}),
        ...(role_id ? { role_id } : {}),
      };
    case 'add_member_role':
    case 'remove_member_role':
      return {
        ...(guild_id ? { guild_id } : {}),
        ...(user_id ? { user_id } : {}),
        ...(role_id ? { role_id } : {}),
      };
    default:
      return {};
  }
}
