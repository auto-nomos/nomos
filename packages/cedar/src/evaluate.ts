import { cedarBinding } from './binding.js';
import type { EvaluateInput, EvaluateResult } from './types.js';

export function evaluate(input: EvaluateInput): EvaluateResult {
  const call = {
    principal: input.principal,
    action: input.action,
    resource: input.resource,
    context: input.context,
    policies: { staticPolicies: input.policies },
    entities: input.entities ?? [],
    ...(input.schema !== undefined ? { schema: input.schema } : {}),
  };
  const result = cedarBinding.isAuthorized(call);
  if (result.type === 'failure') {
    return {
      decision: 'deny',
      reason: [],
      errors: result.errors.map((e) => e.message),
      warnings: result.warnings.map((w) => w.message),
    };
  }
  return {
    decision: result.response.decision,
    reason: result.response.diagnostics.reason,
    errors: result.response.diagnostics.errors.map((e) => e.error.message),
    warnings: result.warnings.map((w) => w.message),
  };
}
