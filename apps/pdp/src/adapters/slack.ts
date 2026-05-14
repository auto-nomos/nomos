/**
 * Slack data-plane gate. Sits between `decide()` (UCAN + policy) and
 * `oauth.ts`'s slack proxy. Re-derives the target channel/user/thread
 * from `apiCall` and rejects any call outside the `SlackConstraint`.
 *
 * Slack identifies resources in body/query rather than URL — we inspect
 * both. Without this gate an agent holding a UCAN scoped to channel A
 * could call `/chat.postMessage` with `body.channel=C_B` and the
 * connector would obey.
 */
import { parseSlackPath } from '@auto-nomos/schema-packs/slack/path';
import type { SlackConstraint } from '@auto-nomos/shared-types';

export type SlackAdapterFailure =
  | 'channel_mismatch'
  | 'user_mismatch'
  | 'thread_ts_mismatch'
  | 'team_mismatch'
  | 'unparseable_path';

export type SlackAdapterResult = { ok: true } | { ok: false; reason: SlackAdapterFailure };

export interface SlackProxyCall {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
}

export function validateSlackProxyCall(
  constraint: SlackConstraint,
  apiCall: SlackProxyCall,
): SlackAdapterResult {
  const parsed = parseSlackPath(apiCall.path, apiCall.query, apiCall.body);
  if (!parsed) return { ok: false, reason: 'unparseable_path' };
  if (constraint.channel_id !== undefined) {
    if (parsed.channel_id !== constraint.channel_id) {
      return { ok: false, reason: 'channel_mismatch' };
    }
  }
  if (constraint.user_id !== undefined) {
    if (parsed.user_id !== constraint.user_id) {
      return { ok: false, reason: 'user_mismatch' };
    }
  }
  if (constraint.thread_ts !== undefined) {
    if (parsed.thread_ts !== constraint.thread_ts) {
      return { ok: false, reason: 'thread_ts_mismatch' };
    }
  }
  // team_id is workspace-scoped — not exposed in apiCall body; enforced
  // upstream by the OAuth connector pinning a single workspace per token.
  return { ok: true };
}
