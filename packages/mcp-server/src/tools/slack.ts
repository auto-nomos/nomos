import { z } from 'zod';
import { runGuarded } from '../run-guarded.js';
import type { ToolDefinition } from './types.js';

const ListChannelsInput = z.object({
  limit: z.number().int().positive().max(200).optional(),
});
type ListChannelsInput = z.infer<typeof ListChannelsInput>;

const PostMessageInput = z.object({
  channel: z.string().min(1),
  text: z.string().min(1),
});
type PostMessageInput = z.infer<typeof PostMessageInput>;

export const slackTools: ToolDefinition[] = [
  {
    name: 'slack_list_channels',
    title: 'List Slack channels',
    description: 'Lists conversations the authenticated user can see (gated by policy).',
    inputSchema: ListChannelsInput.shape,
    handler: async (guard, raw) => {
      const input: ListChannelsInput = ListChannelsInput.parse(raw);
      return runGuarded(
        guard,
        '/slack/channel/list',
        {},
        {
          method: 'GET',
          path: '/conversations.list',
          ...(input.limit !== undefined ? { query: { limit: String(input.limit) } } : {}),
        },
      );
    },
  },
  {
    name: 'slack_post_message',
    title: 'Post Slack message',
    description: 'Posts a message to a Slack channel (gated by policy).',
    inputSchema: PostMessageInput.shape,
    handler: async (guard, raw) => {
      const input: PostMessageInput = PostMessageInput.parse(raw);
      return runGuarded(
        guard,
        '/slack/message/post',
        { channel: input.channel },
        {
          method: 'POST',
          path: '/chat.postMessage',
          body: { channel: input.channel, text: input.text },
        },
      );
    },
  },
];
