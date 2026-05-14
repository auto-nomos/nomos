import { extractCustomerId } from '@auto-nomos/ucan';

export type { ConsistencyResult, ValidateResult } from '@auto-nomos/schema-packs';
export {
  isKnownCommand,
  validateApiCall,
  validateResource,
  validateResourceConsistency,
} from '@auto-nomos/schema-packs';
export { extractAgentDid, extractAgentId } from '@auto-nomos/ucan';

export const CUSTOMER_HEADER = 'x-cb-customer';

export type DeriveCustomerIdResult =
  | { ok: true; customerId: string; source: 'ucan' | 'header' }
  | { ok: false; code: 'missing'; message: string }
  | {
      ok: false;
      code: 'mismatch';
      message: string;
      headerCustomerId: string;
      ucanCustomerId: string;
    };

/**
 * D2 — derive the authoritative customerId for a PDP request.
 *
 * Priority order:
 *   1. UCAN `meta.customer_id` (signed by CP — cryptographically bound).
 *   2. `x-cb-customer` header (legacy; warn-logged at caller).
 *
 * Behavior:
 *   - Both present + mismatch → reject (mismatch). Closes the spoofing gap
 *     where an attacker presents a valid UCAN for tenant A with a header
 *     for tenant B to probe B's cached policy bundle or pollute B's audit.
 *   - Both present + match → `source: 'ucan'`.
 *   - UCAN-only → `source: 'ucan'`.
 *   - Header-only → `source: 'header'` (legacy path; warn at caller).
 *   - Neither → reject (missing).
 *
 * The first leaf UCAN is enough for derivation because chain attenuation
 * never widens the tenant — meta.customer_id is set by the root issuer (CP)
 * and copied unchanged across child UCANs.
 */
export function deriveCustomerId(
  headerCustomerId: string | undefined,
  ucanJwt: string,
): DeriveCustomerIdResult {
  const ucanCustomerId = extractCustomerId(ucanJwt);

  if (ucanCustomerId && headerCustomerId && ucanCustomerId !== headerCustomerId) {
    return {
      ok: false,
      code: 'mismatch',
      message: 'x-cb-customer header does not match UCAN meta.customer_id',
      headerCustomerId,
      ucanCustomerId,
    };
  }
  if (ucanCustomerId) {
    return { ok: true, customerId: ucanCustomerId, source: 'ucan' };
  }
  if (headerCustomerId) {
    return { ok: true, customerId: headerCustomerId, source: 'header' };
  }
  return {
    ok: false,
    code: 'missing',
    message: 'missing x-cb-customer header and UCAN meta.customer_id',
  };
}
