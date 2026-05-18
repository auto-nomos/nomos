/**
 * M9 — cloud-specific risk rules.
 *
 * Defense-in-depth on top of customer Cedar policies. Even if a policy
 * statically allows a destructive cloud action, we want cosigner=true to
 * be a hard gate. Without this safety net, an overly-permissive policy
 * (e.g. `permit (principal, action, resource);` during onboarding) could
 * allow a delete to slip through.
 *
 * Behavior: if the request.command matches a destructive pattern, the
 * PDP treats the decision as `requiresStepUp` unless context.cosigner is
 * already true. This converts what Cedar would have allowed into a
 * step-up flow.
 *
 * Patterns are intentionally simple (substring on command segment) so
 * customers can predict behavior. Override per-tenant when the default
 * is too strict — there's no opt-out yet; revisit in M2 if real
 * customers ask.
 */

import type { DecideInput } from '@auto-nomos/core';
import type { AuthorizeDecision } from '@auto-nomos/shared-types';

// Verbs that always require cosigner regardless of Cedar policy.
const DESTRUCTIVE_VERBS = [
  'delete',
  'destroy',
  'terminate',
  'stop',
  'drain',
  'rotate',
  'run_command',
  'invoke',
  'scale',
  'redeploy',
  // Additions for broader Azure coverage:
  'purge', // KV purge — bypasses soft-delete recovery.
  'regenerate_key', // Storage/Cosmos key rotation invalidates existing creds.
  'deallocate', // VM deallocate releases public IPs.
  'reimage', // VMSS reimage drops local state.
  'remove_rule', // NSG rule removal can break network reachability.
  'detach_disk', // Disk detach can corrupt running VM.
  'capture', // Captures an image including possibly sensitive data.
  'uninstall_extension', // Extension uninstall can remove guard agents.
  'cancel_run',
  'cancel',
  'power_off',
  'slot_swap', // Swap can mis-route prod traffic.
];

// Read verbs that should never trip the rule even if they happen to
// contain a destructive substring (rare but defensive).
const READ_VERBS = ['list', 'get', 'read', 'describe', 'query'];

export function isCloudCommand(command: string): boolean {
  return (
    command.startsWith('/azure/') || command.startsWith('/aws/') || command.startsWith('/gcp/')
  );
}

export function commandIsDestructive(command: string): boolean {
  if (!isCloudCommand(command)) return false;
  const segments = command.split('/').filter(Boolean);
  if (segments.length < 2) return false;
  const verb = segments[segments.length - 1] ?? '';
  if (READ_VERBS.some((r) => verb.startsWith(r))) return false;
  return DESTRUCTIVE_VERBS.some((d) => verb.includes(d));
}

/**
 * Returns true if the request should be diverted to step-up despite an
 * allow decision. Caller is expected to synthesize the push_approvals
 * row + return `requiresStepUp` in the response.
 */
export function shouldForceStepUp(
  decision: AuthorizeDecision,
  input: Pick<DecideInput, 'request'>,
): boolean {
  if (!decision.allow) return false;
  if (!isCloudCommand(input.request.command)) return false;
  if (!commandIsDestructive(input.request.command)) return false;
  const ctx = input.request.context as Record<string, unknown> | undefined;
  if (ctx && ctx.cosigner === true) return false;
  return true;
}
