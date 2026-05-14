/**
 * Linear hand-curated overrides. Linear is GraphQL — every action is a
 * POST to `/` carrying `{query, variables}`. The generated floor enforces
 * method + path; the hand override adds a non-empty `body.query` floor
 * and a permissive `linearResource` zod.
 */
import { z } from 'zod';
import type { ActionSchemas } from '../types.js';

const safePath = z
  .string()
  .min(1)
  .refine((p: string) => !p.includes('..') && !p.includes('//'), {
    message: 'path must not contain `..` or `//` segments',
  });

const graphqlCall = z.object({
  method: z.literal('POST'),
  path: safePath.refine((p) => p === '/' || p === '/graphql' || p === '', {
    message: 'linear apiCall.path must be `/` or `/graphql`',
  }),
  query: z.record(z.string(), z.string()).optional(),
  body: z
    .object({
      query: z.string().min(1),
      variables: z.record(z.string(), z.unknown()).optional(),
      operationName: z.string().optional(),
    })
    .passthrough(),
  headers: z.record(z.string(), z.string()).optional(),
});

const linearResource = z
  .object({
    team_id: z.string().optional(),
    project_id: z.string().optional(),
    issue_id: z.string().optional(),
  })
  .passthrough();

const ALL_LINEAR_COMMANDS = [
  '/linear/issue/list',
  '/linear/issue/create',
  '/linear/issue/comment',
  '/linear/issue/read',
  '/linear/issue/update',
  '/linear/issue/delete',
  '/linear/issue/search',
  '/linear/project/list',
  '/linear/project/read',
  '/linear/project/create',
  '/linear/project/update',
  '/linear/team/list',
  '/linear/team/list_members',
  '/linear/workflow_state/list',
  '/linear/label/list',
  '/linear/comment/list',
  '/linear/viewer/read',
];

export const linearActionSchemas: Partial<Record<string, ActionSchemas>> = Object.fromEntries(
  ALL_LINEAR_COMMANDS.map((cmd) => [
    cmd,
    { apiCallSchema: graphqlCall, resourceSchema: linearResource },
  ]),
);
