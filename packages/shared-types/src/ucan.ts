import { z } from 'zod';
import { Did } from './did.js';

export const COMMAND_REGEX = /^\/[a-z0-9_-]+(\/[a-z0-9_-]+)*$/;

export const Command = z
  .string()
  .regex(COMMAND_REGEX, 'invalid command — must match /^\\/[a-z0-9_-]+(\\/[a-z0-9_-]+)*$/');

export const PolicyPredicate = z.tuple([z.string(), z.string(), z.unknown()]);

/**
 * Issuer-vouched bound on what an agent may access for the lifetime of a
 * UCAN. Carried under `meta.resource_constraint`. Provider-tagged union;
 * each variant declares the structural shape the data-plane proxy enforces.
 *
 * Filesystem is the first slice. Other providers follow as additional
 * variants; chain attenuation requires `provider` equality between parent
 * and child constraints.
 */
export const FilesystemConstraint = z.object({
  provider: z.literal('filesystem'),
  path_prefix: z.string().min(1),
  host: z.string().optional(),
});

/**
 * GitHub variant. `owner` is required (we never grant org-wildcard).
 * Optional fields narrow further: omitting `repo` permits org-wide reads;
 * setting `pr_number` / `issue_number` pins to a single PR/issue;
 * `path_prefix` scopes to a directory inside a repo's tree; `ref` pins
 * to a branch / tag / sha. Chain attenuation only allows narrowing.
 */
export const GithubConstraint = z.object({
  provider: z.literal('github'),
  owner: z.string().min(1),
  repo: z.string().min(1).optional(),
  ref: z.string().min(1).optional(),
  path_prefix: z.string().min(1).optional(),
  issue_number: z.number().int().positive().optional(),
  pr_number: z.number().int().positive().optional(),
});

export const ResourceConstraint = z.discriminatedUnion('provider', [
  FilesystemConstraint,
  GithubConstraint,
]);

export type FilesystemConstraint = z.infer<typeof FilesystemConstraint>;
export type GithubConstraint = z.infer<typeof GithubConstraint>;
export type ResourceConstraint = z.infer<typeof ResourceConstraint>;

export const UcanPayload = z
  .object({
    iss: Did,
    aud: Did,
    cmd: Command,
    sub: z.string().optional(),
    pol: z.array(PolicyPredicate),
    nonce: z.string().min(1),
    meta: z.record(z.string(), z.unknown()).optional(),
    nbf: z.number().int().nonnegative(),
    exp: z.number().int().positive(),
    prf: z.array(z.string()).optional(),
  })
  .refine((d) => d.exp > d.nbf, {
    message: 'exp must be greater than nbf',
    path: ['exp'],
  });

export const UcanIssue = z.object({
  cid: z.string().min(1),
  jwt: z.string().min(1),
  payload: UcanPayload,
});

export type Command = z.infer<typeof Command>;
export type PolicyPredicate = z.infer<typeof PolicyPredicate>;
export type UcanPayload = z.infer<typeof UcanPayload>;
export type UcanIssue = z.infer<typeof UcanIssue>;
