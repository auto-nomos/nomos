/**
 * D3 (Lane B): per-action zod schemas the PDP enforces before decide().
 *
 * Defense-in-depth philosophy, not API shape replication:
 *   - Validate the HTTP method matches the action's verb.
 *   - Validate required body keys where the SaaS endpoint mandates them.
 *   - Reject path traversal (`..`, double-slash) — real GitHub also rejects
 *     these but failing early at the PDP is cleaner for audit.
 *   - Do NOT replicate the SaaS API contract (path patterns, exhaustive
 *     param keys). The provider is the source of truth for that; if the
 *     PDP and provider drift, audit will record the schema-pack version
 *     and the failure mode is observable.
 *
 * Resource schemas (Cedar-facing) are intentionally permissive — Cedar
 * policies match on specific keys; extras pass through.
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

const githubResource = z
  .object({
    repo: z.string().optional(),
    owner: z.string().optional(),
    repo_name: z.string().optional(),
    issue_number: z.number().int().positive().optional(),
    name: z.string().optional(),
  })
  .passthrough();

const getCall = apiCallBase.extend({ method: z.literal('GET') });
const postCall = apiCallBase.extend({ method: z.literal('POST') });
const patchCall = apiCallBase.extend({ method: z.literal('PATCH') });
const deleteCall = apiCallBase.extend({ method: z.literal('DELETE') });

/** POST /repos/:owner/:repo/issues with body.title (required by GitHub). */
const issueCreateCall = postCall.extend({
  body: z
    .object({ title: z.string().min(1) })
    .passthrough()
    .optional(),
});

/** POST /repos/:owner/:repo/issues/:n/comments with body.body (required). */
const issueCommentCall = postCall.extend({
  body: z
    .object({ body: z.string().min(1) })
    .passthrough()
    .optional(),
});

/** PATCH /repos/:owner/:repo/issues/:n — state=closed (semantic close). */
const issueCloseCall = patchCall.extend({
  body: z
    .object({ state: z.literal('closed') })
    .passthrough()
    .optional(),
});

/** POST /user/repos — body.name required by GitHub. */
const repoCreateCall = postCall.extend({
  body: z
    .object({ name: z.string().min(1) })
    .passthrough()
    .optional(),
});

export const githubActionSchemas: Partial<Record<string, ActionSchemas>> = {
  '/github/user/read': {
    apiCallSchema: getCall,
    resourceSchema: githubResource,
  },
  '/github/repo/list': {
    apiCallSchema: getCall,
    resourceSchema: githubResource,
  },
  '/github/repo/create': {
    apiCallSchema: repoCreateCall,
    resourceSchema: githubResource,
  },
  '/github/repo/delete': {
    apiCallSchema: deleteCall,
    resourceSchema: githubResource,
  },
  '/github/issue/list': {
    apiCallSchema: getCall,
    resourceSchema: githubResource,
  },
  '/github/issue/read': {
    apiCallSchema: getCall,
    resourceSchema: githubResource,
  },
  '/github/issue/create': {
    apiCallSchema: issueCreateCall,
    resourceSchema: githubResource,
  },
  '/github/issue/comment': {
    apiCallSchema: issueCommentCall,
    resourceSchema: githubResource,
  },
  '/github/issue/close': {
    apiCallSchema: issueCloseCall,
    resourceSchema: githubResource,
  },
};
