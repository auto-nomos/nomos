/**
 * Pick a JwtSigner based on config.
 *
 *   Dev:  OIDC_DEV_RSA_PRIVATE_KEY_PEM set → LocalRs256Signer.
 *   Prod: OIDC_KMS_KEY_ARN set            → KmsRs256Signer (TODO M0b).
 *
 * Mint refuses to start with neither configured.
 */
import type { JwtSigner, RsaPublicJwk } from '@auto-nomos/crypto';
import { LocalRs256Signer, publicJwkFromPrivatePem } from '@auto-nomos/crypto';
import { KmsRs256Signer } from './kms-signer.js';

export interface ResolvedSigner {
  signer: JwtSigner;
  publicJwk: RsaPublicJwk;
}

export function buildSignerFromConfig(env: {
  OIDC_DEV_RSA_PRIVATE_KEY_PEM?: string | undefined;
  OIDC_DEV_KID?: string | undefined;
  OIDC_DEV_RSA_PUBLIC_JWK?: string | undefined;
  OIDC_KMS_KEY_ARN?: string | undefined;
}): ResolvedSigner | null {
  if (env.OIDC_KMS_KEY_ARN) {
    if (!env.OIDC_DEV_KID || !env.OIDC_DEV_RSA_PUBLIC_JWK) {
      throw new Error(
        'OIDC_KMS_KEY_ARN requires OIDC_DEV_KID + OIDC_DEV_RSA_PUBLIC_JWK (the JWK published in JWKS, derived from kms:GetPublicKey).',
      );
    }
    const signer = new KmsRs256Signer({ kid: env.OIDC_DEV_KID, keyArn: env.OIDC_KMS_KEY_ARN });
    const publicJwk = JSON.parse(env.OIDC_DEV_RSA_PUBLIC_JWK) as RsaPublicJwk;
    if (publicJwk.kid !== env.OIDC_DEV_KID) {
      throw new Error(
        `OIDC_DEV_RSA_PUBLIC_JWK.kid (${publicJwk.kid}) does not match OIDC_DEV_KID (${env.OIDC_DEV_KID})`,
      );
    }
    return { signer, publicJwk };
  }
  if (!env.OIDC_DEV_RSA_PRIVATE_KEY_PEM || !env.OIDC_DEV_KID) {
    return null;
  }
  const signer = new LocalRs256Signer({
    kid: env.OIDC_DEV_KID,
    privateKeyPem: env.OIDC_DEV_RSA_PRIVATE_KEY_PEM,
  });
  const publicJwk = env.OIDC_DEV_RSA_PUBLIC_JWK
    ? (JSON.parse(env.OIDC_DEV_RSA_PUBLIC_JWK) as RsaPublicJwk)
    : publicJwkFromPrivatePem({
        kid: env.OIDC_DEV_KID,
        privateKeyPem: env.OIDC_DEV_RSA_PRIVATE_KEY_PEM,
      });
  if (publicJwk.kid !== env.OIDC_DEV_KID) {
    throw new Error(
      `OIDC_DEV_RSA_PUBLIC_JWK.kid (${publicJwk.kid}) does not match OIDC_DEV_KID (${env.OIDC_DEV_KID})`,
    );
  }
  return { signer, publicJwk };
}
