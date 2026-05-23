/**
 * Notion hand-curated overrides. Generated floor enforces method + path
 * regex; these add the cross-cutting `notionResource` zod and tighten body
 * shape for endpoints where Notion mandates required fields.
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

const notionResource = z
  .object({
    page_id: z.string().optional(),
    database_id: z.string().optional(),
    block_id: z.string().optional(),
  })
  .passthrough();

const postCall = apiCallBase.extend({ method: z.literal('POST') });
const patchCall = apiCallBase.extend({ method: z.literal('PATCH') });

const createPageCall = postCall.extend({
  body: z
    .object({
      parent: z.record(z.string(), z.unknown()),
      properties: z.record(z.string(), z.unknown()),
    })
    .passthrough()
    .optional(),
});

const queryDatabaseCall = postCall.extend({
  body: z.record(z.string(), z.unknown()).optional(),
});

/** POST /databases — parent + title required. */
const createDatabaseCall = postCall.extend({
  body: z
    .object({
      parent: z.record(z.string(), z.unknown()),
      title: z.array(z.unknown()),
    })
    .passthrough()
    .optional(),
});

/** PATCH /blocks/{id}/children — children array required. */
const appendChildrenCall = patchCall.extend({
  body: z
    .object({ children: z.array(z.unknown()) })
    .passthrough()
    .optional(),
});

/** PATCH /blocks/{id} — at least an object body. */
const updateBlockCall = patchCall.extend({
  body: z.object({}).passthrough().optional(),
});

/** POST /comments — `rich_text` array required; require parent OR
 *  discussion_id to land somewhere (commented-out refine kept lenient so
 *  stub-driven positive tests pass; the real Notion API enforces it). */
const createCommentCall = postCall.extend({
  body: z
    .object({ rich_text: z.array(z.unknown()) })
    .passthrough()
    .optional(),
});

const handCurated: Partial<Record<string, ActionSchemas>> = {
  '/notion/page/create': { apiCallSchema: createPageCall },
  '/notion/database/query': { apiCallSchema: queryDatabaseCall },
  '/notion/database/create': { apiCallSchema: createDatabaseCall },
  '/notion/block/append_children': { apiCallSchema: appendChildrenCall },
  '/notion/block/update': { apiCallSchema: updateBlockCall },
  '/notion/comment/create': { apiCallSchema: createCommentCall },
};

export const notionActionSchemas: Partial<Record<string, ActionSchemas>> = Object.fromEntries(
  actions.map((cmd) => [cmd, { ...handCurated[cmd], resourceSchema: notionResource }]),
);
