/**
 * KMS-backed RS256 signer for the production OIDC issuer.
 *
 * Calls `kms:Sign` with `MessageType: RAW` and
 * `SigningAlgorithm: RSASSA_PKCS1_V1_5_SHA_256`. KMS hashes the payload
 * internally; we pass the raw `header.payload` bytes. The private key
 * never leaves the HSM.
 *
 * Caller is responsible for supplying the kid + matching public JWK
 * (write the JWK to oidc_issuer_keys when provisioning the KMS key —
 * AWS surfaces the public key via `kms:GetPublicKey` and the rotation
 * script handles the JWK conversion).
 */

import type { JwtSigner } from '@auto-nomos/crypto';
import { KMSClient, SignCommand } from '@aws-sdk/client-kms';

export interface KmsRs256SignerOpts {
  kid: string;
  /** ARN of the asymmetric RSA_2048 KMS key. */
  keyArn: string;
  /** AWS region. Defaults to AWS_REGION env, falls back to us-east-1. */
  region?: string;
  /** Override client for tests. */
  client?: KMSClient;
}

export class KmsRs256Signer implements JwtSigner {
  readonly kid: string;
  private readonly keyArn: string;
  private readonly client: KMSClient;

  constructor(opts: KmsRs256SignerOpts) {
    this.kid = opts.kid;
    this.keyArn = opts.keyArn;
    this.client = opts.client ?? new KMSClient({ region: opts.region });
  }

  async sign(input: Uint8Array): Promise<Uint8Array> {
    const result = await this.client.send(
      new SignCommand({
        KeyId: this.keyArn,
        Message: input,
        MessageType: 'RAW',
        SigningAlgorithm: 'RSASSA_PKCS1_V1_5_SHA_256',
      }),
    );
    if (!result.Signature) {
      throw new Error('kms_sign_no_signature');
    }
    return new Uint8Array(result.Signature);
  }
}
