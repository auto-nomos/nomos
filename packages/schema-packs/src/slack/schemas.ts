/**
 * Slack hand-curated apiCall + resource overrides. The generated floor in
 * `__generated__/slack-api-schemas.ts` already enforces method + path
 * regex; these tighten body shape for endpoints where Slack itself
 * mandates required fields and adds the cross-cutting `slackResource`
 * zod for Cedar resource matching.
 */
import { z } from 'zod';
import type { ActionSchemas } from '../types.js';

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

export const slackActionSchemas: Partial<Record<string, ActionSchemas>> = {
  '/slack/message/post': { apiCallSchema: postMessageCall, resourceSchema: slackResource },
  '/slack/message/reply': { apiCallSchema: postMessageCall, resourceSchema: slackResource },
  '/slack/message/delete': { apiCallSchema: deleteMessageCall, resourceSchema: slackResource },
  '/slack/channel/list': { resourceSchema: slackResource },
  '/slack/channel/history': { resourceSchema: slackResource },
  '/slack/channel/read': { resourceSchema: slackResource },
};
