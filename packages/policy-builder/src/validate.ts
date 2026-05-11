/**
 * Round-trip safety net.
 *
 * The visual builder operates on the IR; before any IR is shown to the
 * user as Cedar (or saved), we emit and re-parse to make sure the
 * emitter didn't drift from cedar-wasm's grammar.
 */
import { parsePolicy } from '@auto-nomos/cedar';
import { emitPolicySet } from './emit.js';
import type { VisualPolicy } from './ir.js';

export interface RoundTripOk {
  ok: true;
  cedarText: string;
}

export interface RoundTripFail {
  ok: false;
  cedarText: string;
  errors: { message: string }[];
}

export type RoundTripResult = RoundTripOk | RoundTripFail;

export function roundTrip(policies: VisualPolicy[]): RoundTripResult {
  const cedarText = emitPolicySet(policies);
  const parse = parsePolicy(cedarText);
  if (parse.ok) return { ok: true, cedarText };
  return { ok: false, cedarText, errors: parse.errors.map((e) => ({ message: e.message })) };
}
