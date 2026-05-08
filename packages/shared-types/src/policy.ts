import { z } from 'zod';

export const Policy = z.object({
  id: z.string().uuid(),
  customer_id: z.string().uuid(),
  integration: z.string().min(1),
  cedar_text: z.string().min(1),
  version: z.number().int().positive(),
  enabled: z.boolean(),
  created_at: z.number().int().nonnegative(),
  updated_at: z.number().int().nonnegative(),
});

export const PolicyBundle = z.object({
  customer_id: z.string().uuid(),
  version: z.number().int().positive(),
  generated_at: z.number().int().nonnegative(),
  policies: z.array(Policy),
  schema_hashes: z.record(z.string(), z.string()),
});

export const SignedPolicyBundle = z.object({
  bundle: PolicyBundle,
  signature: z.string().min(1),
  signing_key_id: z.string().min(1),
});

export const RevocationEntry = z.object({
  cid: z.string().min(1),
  customer_id: z.string().uuid(),
  revoked_at: z.number().int().nonnegative(),
  reason: z.string().optional(),
});

export const RevocationList = z.object({
  customer_id: z.string().uuid(),
  generated_at: z.number().int().nonnegative(),
  entries: z.array(RevocationEntry),
});

export type Policy = z.infer<typeof Policy>;
export type PolicyBundle = z.infer<typeof PolicyBundle>;
export type SignedPolicyBundle = z.infer<typeof SignedPolicyBundle>;
export type RevocationEntry = z.infer<typeof RevocationEntry>;
export type RevocationList = z.infer<typeof RevocationList>;
