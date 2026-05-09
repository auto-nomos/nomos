/**
 * Sprint 9.4 — validate the cosigner UCAN the SDK retries with after a
 * passkey approval. Validation is defense-in-depth across three layers:
 *
 *   1. Cryptographic — the cosigner UCAN must validate against its `iss`
 *      DID (the control-plane signing key). `validateUcan` already does
 *      signature + nbf/exp + command-match.
 *
 *   2. Binding — `meta.cosigner_for` must equal `computeCid(request.ucan)`.
 *      Without this, a cosigner minted for one request could unlock a
 *      different one.
 *
 *   3. State — control plane confirms the approval is in `approved` state
 *      and the stored `cosigner_attestation_jwt` matches what we received
 *      bit-for-bit. Re-using a stale or rolled-back JWT fails here.
 */
import { computeCid, parseUcanJwt, validateUcan } from '@credential-broker/ucan';
import type { StepUpStateResponse } from '../control-plane/client.js';

export type CosignerValidationFailure =
  | 'cosigner_invalid'
  | 'cosigner_expired'
  | 'cosigner_not_approved'
  | 'cosigner_mismatch';

export interface CosignerValidationOk {
  ok: true;
  approvalId: string;
}

export interface CosignerValidationErr {
  ok: false;
  reason: CosignerValidationFailure;
}

export type CosignerValidationResult = CosignerValidationOk | CosignerValidationErr;

export interface ValidateCosignerInput {
  cosignerJwt: string;
  requestUcan: string;
  command: string;
  now?: number;
  fetchApproval: (approvalId: string) => Promise<StepUpStateResponse | undefined>;
}

export async function validateCosigner(
  input: ValidateCosignerInput,
): Promise<CosignerValidationResult> {
  const parsed = parseUcanJwt(input.cosignerJwt);
  if ('error' in parsed) {
    return { ok: false, reason: 'cosigner_invalid' };
  }
  const meta = parsed.payload.meta as Record<string, unknown> | undefined;
  const cosignerFor = typeof meta?.cosigner_for === 'string' ? meta.cosigner_for : undefined;
  const approvalId = typeof meta?.approval_id === 'string' ? meta.approval_id : undefined;
  if (!cosignerFor || !approvalId) {
    return { ok: false, reason: 'cosigner_invalid' };
  }

  const validation = validateUcan(input.cosignerJwt, {
    expectedCommand: input.command,
    ...(input.now !== undefined ? { now: input.now } : {}),
  });
  if (!validation.valid) {
    return {
      ok: false,
      reason: validation.error === 'expired' ? 'cosigner_expired' : 'cosigner_invalid',
    };
  }

  if (cosignerFor !== computeCid(input.requestUcan)) {
    return { ok: false, reason: 'cosigner_mismatch' };
  }

  const approval = await input.fetchApproval(approvalId);
  if (!approval) {
    return { ok: false, reason: 'cosigner_invalid' };
  }
  if (approval.state !== 'approved') {
    return { ok: false, reason: 'cosigner_not_approved' };
  }
  if (approval.cosignerAttestationJwt !== input.cosignerJwt) {
    return { ok: false, reason: 'cosigner_mismatch' };
  }

  return { ok: true, approvalId };
}
