/**
 * Mint short-lived OIDC ID tokens that cloud STS / AAD / WIF endpoints
 * accept as federated client assertions.
 *
 * Standard OIDC claims (iss, sub, aud, iat, exp, nbf, jti) plus a
 * `nomos` namespace carrying the customer_id / agent_id / intent_id /
 * ucan_cid so audit and the cloud-side adapter can correlate the call.
 */
import { randomUUID } from 'node:crypto';
import type { JwtSigner } from '@auto-nomos/crypto';
import { signJwtRs256 } from '@auto-nomos/crypto';

export interface MintIdTokenInput {
  customerId: string;
  agentId: string;
  audience: string;
  ttlSeconds: number;
  intentId?: string;
  ucanCid?: string;
}

export interface MintIdTokenResult {
  token: string;
  kid: string;
  jti: string;
  sub: string;
  expiresAt: Date;
}

export async function mintIdToken(
  signer: JwtSigner,
  issuer: string,
  input: MintIdTokenInput,
  now: Date = new Date(),
): Promise<MintIdTokenResult> {
  if (input.ttlSeconds < 60 || input.ttlSeconds > 900) {
    throw new Error(`ttlSeconds out of bounds: ${input.ttlSeconds}`);
  }
  const iat = Math.floor(now.getTime() / 1000);
  const exp = iat + input.ttlSeconds;
  const sub = `customer/${input.customerId}/agent/${input.agentId}`;
  const jti = randomUUID();
  const payload: Record<string, unknown> = {
    iss: issuer,
    sub,
    aud: input.audience,
    iat,
    exp,
    nbf: iat,
    jti,
    nomos: {
      customer_id: input.customerId,
      agent_id: input.agentId,
      ...(input.intentId ? { intent_id: input.intentId } : {}),
      ...(input.ucanCid ? { ucan_cid: input.ucanCid } : {}),
    },
  };
  const token = await signJwtRs256(signer, payload);
  return { token, kid: signer.kid, jti, sub, expiresAt: new Date(exp * 1000) };
}
