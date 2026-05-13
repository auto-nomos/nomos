/**
 * Mapping from `packages/adapters/spec/slack.yaml` action ids to canonical
 * Cedar commands. See `../github/actions.ts` for the design rationale.
 */

export const actionToCommand: Record<string, string> = {
  list_channels: '/slack/channel/list',
  list_recent_messages: '/slack/channel/history',
  get_user_info: '/slack/user/read',
  post_message: '/slack/message/post',
  react_to_message: '/slack/message/react',
  list_users: '/slack/user/list',
  get_user_by_email: '/slack/user/lookup',
  update_message: '/slack/message/update',
  delete_message: '/slack/message/delete',
  reply_in_thread: '/slack/message/reply',
  upload_file: '/slack/file/upload',
  open_dm: '/slack/dm/open',
  get_channel_info: '/slack/channel/read',
  search_messages: '/slack/message/search',
  create_channel: '/slack/channel/create',
  invite_to_channel: '/slack/channel/invite',
  pin_message: '/slack/message/pin',
  schedule_message: '/slack/message/schedule',
  set_topic: '/slack/channel/topic',
  remove_reaction: '/slack/message/unreact',
};

export function resourceFor(
  actionId: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const channel = typeof params.channel === 'string' ? params.channel : undefined;
  const ts = typeof params.timestamp === 'string' ? params.timestamp : undefined;
  const user = typeof params.user === 'string' ? params.user : undefined;
  const email = typeof params.email === 'string' ? params.email : undefined;
  const threadTs = typeof params.thread_ts === 'string' ? params.thread_ts : undefined;

  switch (actionId) {
    case 'list_channels':
    case 'list_users':
      return {};
    case 'get_user_info':
      return user ? { user } : {};
    case 'get_user_by_email':
      return email ? { email } : {};
    case 'list_recent_messages':
    case 'post_message':
    case 'upload_file':
      return channel ? { channel } : {};
    case 'react_to_message':
    case 'update_message':
    case 'delete_message':
      return {
        ...(channel ? { channel } : {}),
        ...(ts ? { timestamp: ts } : {}),
      };
    case 'reply_in_thread':
      return {
        ...(channel ? { channel } : {}),
        ...(threadTs ? { thread_ts: threadTs } : {}),
      };
    default:
      return {};
  }
}
