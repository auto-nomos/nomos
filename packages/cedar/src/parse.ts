import { cedarBinding } from './binding.js';
import type { ParseResult } from './types.js';

export function parsePolicy(text: string): ParseResult {
  const result = cedarBinding.checkParsePolicySet({ staticPolicies: text });
  if (result.type === 'success') return { ok: true, errors: [] };
  return { ok: false, errors: result.errors };
}
