import { z } from 'zod';
import { Did } from './did.js';

export const COMMAND_REGEX = /^\/[a-z0-9_-]+(\/[a-z0-9_-]+)*$/;

export const Command = z
  .string()
  .regex(COMMAND_REGEX, 'invalid command — must match /^\\/[a-z0-9_-]+(\\/[a-z0-9_-]+)*$/');

export const PolicyPredicate = z.tuple([z.string(), z.string(), z.unknown()]);

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
