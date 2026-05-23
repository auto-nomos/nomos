/**
 * Customer-edge install surface (Phase B follow-on).
 *
 * Exposes the data a self-host operator needs to install a cb-pdp edge
 * deployment without rummaging through the codebase:
 *   - the Ed25519 public key the control-plane signs bundles with
 *     (PDP refuses bundles that don't verify against this)
 *   - the signer DID it derives from
 *   - the active customer id (to set PDP_CUSTOMER_IDS)
 *
 * The values are read directly from the request's tRPC context so the
 * exposed key always matches what the running CP actually signs with.
 * Pair with `apiKeys.create` (existing) to mint the service token the
 * edge PDP authenticates with on /v1/internal/*.
 */
import { publicKeyFromDid } from '@auto-nomos/crypto';
import { router, tenantProcedure } from '../index.js';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export const edgeRouter = router({
  /**
   * Bundle verify key (hex Ed25519 public key) + signer DID + active
   * customer id. Paste straight into Helm `values.yaml` /
   * `docker-compose.edge.yml` env.
   */
  getInstallContext: tenantProcedure.query(({ ctx }) => {
    const pubkey = publicKeyFromDid(ctx.signing.signerDid);
    return {
      customerId: ctx.customerId,
      signerDid: ctx.signing.signerDid,
      bundleVerifyKeyHex: bytesToHex(pubkey),
    };
  }),
});
