import { cedarBinding } from './binding.js';
import type { LintResult } from './types.js';

export function lintPolicy(text: string): LintResult {
  const parseRes = cedarBinding.checkParsePolicySet({ staticPolicies: text });
  if (parseRes.type === 'failure') {
    return {
      ok: false,
      warnings: parseRes.errors.map((e) => ({ type: 'parse', message: e.message })),
    };
  }
  const fmtRes = cedarBinding.formatPolicies({ policyText: text });
  if (fmtRes.type === 'failure') {
    return {
      ok: false,
      warnings: fmtRes.errors.map((e) => ({ type: 'format', message: e.message })),
    };
  }
  if (fmtRes.formatted_policy.trim() !== text.trim()) {
    return {
      ok: true,
      warnings: [
        { type: 'format', message: 'policy is not formatted; run formatter to normalize' },
      ],
    };
  }
  return { ok: true, warnings: [] };
}
