/**
 * Discord hand-curated apiCall + resource overrides. The generated floor in
 * `__generated__/discord-api-schemas.ts` already enforces method + path
 * regex; these tighten the body shape for endpoints where Discord itself
 * mandates required fields, and add the cross-cutting `discordResource`
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

const discordResource = z
  .object({
    guild_id: z.string().optional(),
    channel_id: z.string().optional(),
    message_id: z.string().optional(),
    role_id: z.string().optional(),
    user_id: z.string().optional(),
  })
  .passthrough();

const postCall = apiCallBase.extend({ method: z.literal('POST') });
const patchCall = apiCallBase.extend({ method: z.literal('PATCH') });
const putCall = apiCallBase.extend({ method: z.literal('PUT') });

/** POST /guilds/{guild_id}/channels — name required; type whitelist if present. */
const createChannelCall = postCall.extend({
  body: z
    .object({
      name: z.string().min(1).max(100),
      type: z.union([z.literal(0), z.literal(2), z.literal(4), z.literal(5)]).optional(),
    })
    .passthrough()
    .optional(),
});

/** POST /channels/{channel_id}/messages — content OR embeds OR components required. */
const postMessageCall = postCall.extend({
  body: z
    .object({})
    .passthrough()
    .refine(
      (b) => {
        const r = b as Record<string, unknown>;
        const hasContent = typeof r.content === 'string' && r.content.length > 0;
        const hasEmbeds = Array.isArray(r.embeds) && (r.embeds as unknown[]).length > 0;
        const hasComponents = Array.isArray(r.components) && (r.components as unknown[]).length > 0;
        return hasContent || hasEmbeds || hasComponents;
      },
      { message: 'post_message requires `content`, `embeds`, or `components`' },
    )
    .optional(),
});

/** POST /guilds/{guild_id}/roles — name required. */
const createRoleCall = postCall.extend({
  body: z
    .object({ name: z.string().min(1).max(100) })
    .passthrough()
    .optional(),
});

/** POST /channels/{channel_id}/invites — all body fields optional. */
const createInviteCall = postCall.extend({
  body: z
    .object({
      max_age: z.number().int().min(0).max(604800).optional(),
      max_uses: z.number().int().min(0).max(100).optional(),
      temporary: z.boolean().optional(),
      unique: z.boolean().optional(),
    })
    .passthrough()
    .optional(),
});

/** POST /channels/{channel_id}/webhooks — name required. */
const createWebhookCall = postCall.extend({
  body: z
    .object({ name: z.string().min(1).max(80) })
    .passthrough()
    .optional(),
});

/** PUT /channels/{channel_id}/permissions/{overwrite_id} — type required. */
const setPermissionsCall = putCall.extend({
  body: z
    .object({
      type: z.union([z.literal(0), z.literal(1)]),
      allow: z.string().optional(),
      deny: z.string().optional(),
    })
    .passthrough()
    .optional(),
});

/** PATCH /channels/{channel_id} — at least one of name/topic/position/parent_id. */
const modifyChannelCall = patchCall.extend({
  body: z
    .object({})
    .passthrough()
    .refine(
      (b) => {
        const r = b as Record<string, unknown>;
        return (
          typeof r.name === 'string' ||
          typeof r.topic === 'string' ||
          typeof r.position === 'number' ||
          typeof r.parent_id === 'string'
        );
      },
      { message: 'modify_channel requires at least one mutable field' },
    )
    .optional(),
});

const handCurated: Partial<Record<string, ActionSchemas>> = {
  '/discord/channel/create': { apiCallSchema: createChannelCall },
  '/discord/channel/modify': { apiCallSchema: modifyChannelCall },
  '/discord/channel/permissions': { apiCallSchema: setPermissionsCall },
  '/discord/message/post': { apiCallSchema: postMessageCall },
  '/discord/role/create': { apiCallSchema: createRoleCall },
  '/discord/invite/create': { apiCallSchema: createInviteCall },
  '/discord/webhook/create': { apiCallSchema: createWebhookCall },
};

// Apply discordResource to every discord action so resource_mismatch can fire.
export const discordActionSchemas: Partial<Record<string, ActionSchemas>> = Object.fromEntries(
  actions.map((cmd) => [cmd, { ...handCurated[cmd], resourceSchema: discordResource }]),
);
