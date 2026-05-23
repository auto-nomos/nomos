/**
 * Slack hand-curated apiCall + resource overrides. The generated floor in
 * `__generated__/slack-api-schemas.ts` already enforces method + path
 * regex; these tighten body shape for endpoints where Slack itself
 * mandates required fields and adds the cross-cutting `slackResource`
 * zod for Cedar resource matching.
 */
import { z } from 'zod';
import type { ActionSchemas } from '../types.js';
import { actions } from './templates.js';

const safePath = z
  .string()
  .min(1)
  .refine((p: string) => !p.includes('..') && !p.includes('//'), {
    message: 'path must not contain `..` or `//` segments',
  });

const apiCallBase = z.object({
  method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']),
  path: safePath,
  query: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

const slackResource = z
  .object({
    channel: z.string().optional(),
    channel_id: z.string().optional(),
    user_id: z.string().optional(),
    thread_ts: z.string().optional(),
  })
  .passthrough();

const postCall = apiCallBase.extend({ method: z.literal('POST') });

/** POST /chat.postMessage needs `channel` + at least one of `text|blocks`. */
const postMessageCall = postCall.extend({
  body: z
    .object({ channel: z.string().min(1) })
    .and(
      z.union([
        z.object({ text: z.string().min(1) }).passthrough(),
        z.object({ blocks: z.array(z.unknown()).min(1) }).passthrough(),
      ]),
    )
    .optional(),
});

/** POST /chat.delete needs `channel` + `ts`. */
const deleteMessageCall = postCall.extend({
  body: z
    .object({ channel: z.string().min(1), ts: z.string().min(1) })
    .passthrough()
    .optional(),
});

/** POST /chat.update needs `channel` + `ts` + (text|blocks). */
const updateMessageCall = postCall.extend({
  body: z
    .object({ channel: z.string().min(1), ts: z.string().min(1) })
    .and(
      z.union([
        z.object({ text: z.string().min(1) }).passthrough(),
        z.object({ blocks: z.array(z.unknown()).min(1) }).passthrough(),
      ]),
    )
    .optional(),
});

/** POST /reactions.add | reactions.remove — channel + name + timestamp required. */
const reactionCall = postCall.extend({
  body: z
    .object({
      channel: z.string().min(1),
      name: z.string().min(1),
      timestamp: z.string().min(1),
    })
    .passthrough()
    .optional(),
});

/** POST /chat.scheduleMessage — channel + post_at + (text|blocks). */
const scheduleMessageCall = postCall.extend({
  body: z
    .object({
      channel: z.string().min(1),
      post_at: z.union([z.number().int().positive(), z.string().min(1)]),
    })
    .and(
      z.union([
        z.object({ text: z.string().min(1) }).passthrough(),
        z.object({ blocks: z.array(z.unknown()).min(1) }).passthrough(),
      ]),
    )
    .optional(),
});

/** POST /conversations.create — name required. */
const createChannelCall = postCall.extend({
  body: z
    .object({ name: z.string().min(1) })
    .passthrough()
    .optional(),
});

/** POST /conversations.setTopic — channel + topic. */
const setTopicCall = postCall.extend({
  body: z
    .object({ channel: z.string().min(1), topic: z.string() })
    .passthrough()
    .optional(),
});

/** POST /conversations.open — users (csv) or channel required. */
const openDmCall = postCall.extend({
  body: z
    .object({})
    .passthrough()
    .refine(
      (b) =>
        typeof (b as { users?: unknown }).users === 'string' ||
        typeof (b as { channel?: unknown }).channel === 'string',
      { message: 'open_dm requires `users` (csv) or `channel`' },
    )
    .optional(),
});

/** POST /files.upload — at least one of channels/channel_id required. */
const uploadFileCall = postCall.extend({
  body: z
    .object({})
    .passthrough()
    .refine(
      (b) =>
        typeof (b as { channels?: unknown }).channels === 'string' ||
        typeof (b as { channel_id?: unknown }).channel_id === 'string',
      { message: 'upload_file requires `channels` or `channel_id`' },
    )
    .optional(),
});

// Hand-curated overrides — these win over generated. Resource schema is
// applied to every slack command so Cedar policies can match on channel/user/thread.
const handCurated: Partial<Record<string, ActionSchemas>> = {
  '/slack/message/post': { apiCallSchema: postMessageCall },
  '/slack/message/reply': { apiCallSchema: postMessageCall },
  '/slack/message/delete': { apiCallSchema: deleteMessageCall },
  '/slack/message/update': { apiCallSchema: updateMessageCall },
  '/slack/message/react': { apiCallSchema: reactionCall },
  '/slack/message/unreact': { apiCallSchema: reactionCall },
  '/slack/message/schedule': { apiCallSchema: scheduleMessageCall },
  '/slack/message/pin': {
    apiCallSchema: postCall.extend({
      body: z
        .object({ channel: z.string().min(1), timestamp: z.string().min(1) })
        .passthrough()
        .optional(),
    }),
  },
  '/slack/channel/create': { apiCallSchema: createChannelCall },
  '/slack/channel/topic': { apiCallSchema: setTopicCall },
  '/slack/channel/invite': {
    apiCallSchema: postCall.extend({
      body: z
        .object({ channel: z.string().min(1), users: z.string().min(1) })
        .passthrough()
        .optional(),
    }),
  },
  '/slack/dm/open': { apiCallSchema: openDmCall },
  '/slack/file/upload': { apiCallSchema: uploadFileCall },
};

// Apply slackResource to every slack action so resource_mismatch can fire.
export const slackActionSchemas: Partial<Record<string, ActionSchemas>> = Object.fromEntries(
  actions.map((cmd) => [cmd, { ...handCurated[cmd], resourceSchema: slackResource }]),
);
