/**
 * Linear hand-curated overrides. Linear is GraphQL — every action is a
 * POST to `/` or `/graphql` carrying `{query, variables}`. The generated
 * floor enforces method + path; the hand override adds a non-empty
 * `body.query` floor and a permissive `linearResource` zod, then tightens
 * mutation bodies that the server requires to carry an `input` variable.
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

const linearResource = z
  .object({
    team_id: z.string().optional(),
    project_id: z.string().optional(),
    issue_id: z.string().optional(),
  })
  .passthrough();

const graphqlPath = safePath.refine((p) => p === '/' || p === '/graphql' || p === '', {
  message: 'linear apiCall.path must be `/` or `/graphql`',
});

const graphqlCall = z.object({
  method: z.literal('POST'),
  path: graphqlPath,
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

export const linearActionSchemas: Partial<Record<string, ActionSchemas>> = Object.fromEntries(
  actions.map((cmd) => [cmd, { apiCallSchema: graphqlCall, resourceSchema: linearResource }]),
);
