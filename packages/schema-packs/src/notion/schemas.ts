/**
 * Notion hand-curated overrides. Generated floor enforces method + path
 * regex; these add the cross-cutting `notionResource` zod and a stricter
 * body shape for `pages.create` (Notion requires `parent` + `properties`).
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

const notionResource = z
  .object({
    page_id: z.string().optional(),
    database_id: z.string().optional(),
    block_id: z.string().optional(),
  })
  .passthrough();

const postCall = apiCallBase.extend({ method: z.literal('POST') });

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

export const notionActionSchemas: Partial<Record<string, ActionSchemas>> = {
  '/notion/page/create': { apiCallSchema: createPageCall, resourceSchema: notionResource },
  '/notion/database/query': { apiCallSchema: queryDatabaseCall, resourceSchema: notionResource },
  '/notion/page/read': { resourceSchema: notionResource },
  '/notion/page/update': { resourceSchema: notionResource },
  '/notion/block/list_children': { resourceSchema: notionResource },
  '/notion/block/append_children': { resourceSchema: notionResource },
  '/notion/block/delete': { resourceSchema: notionResource },
  '/notion/database/read': { resourceSchema: notionResource },
  '/notion/database/update': { resourceSchema: notionResource },
};
