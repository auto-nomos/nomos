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
};

export function resourceFor(
  actionId: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const channel = typeof params.channel === 'string' ? params.channel : undefined;
  const ts = typeof params.timestamp === 'string' ? params.timestamp : undefined;
  const user = typeof params.user === 'string' ? params.user : undefined;

  switch (actionId) {
    case 'list_channels':
      return {};
    case 'get_user_info':
      return user ? { user } : {};
    case 'list_recent_messages':
    case 'post_message':
      return channel ? { channel } : {};
    case 'react_to_message':
      return {
        ...(channel ? { channel } : {}),
        ...(ts ? { timestamp: ts } : {}),
      };
    default:
      return {};
  }
}
