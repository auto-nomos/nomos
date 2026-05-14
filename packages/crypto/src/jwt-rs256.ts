/**
 * RS256 JWT signing for the Nomos OIDC issuer.
 *
 * AWS STS and Azure AD don't accept EdDSA federation tokens, so the issuer
 * key is RSA-SHA256. Production signing happens in AWS KMS (the private
 * key never leaves the HSM); local dev uses a PEM key loaded from env.
 *
 * This module ships the JWT assembly (header + payload base64url-encoding,
 * canonical JSON ordering, signature attachment) and a `LocalRs256Signer`
 * backed by Node's built-in `crypto`. The KMS-backed signer lives in the
 * control-plane app where the AWS SDK is in scope.
 */

import {
  createPrivateKey,
  createPublicKey,
  createVerify,
  type JsonWebKey,
  sign as nodeSign,
} from 'node:crypto';

export interface JwtSigner {
  /** Key id surfaced in the JWT header. */
  kid: string;
  /** Sign the input bytes with RS256 and return the signature. */
  sign(input: Uint8Array): Promise<Uint8Array>;
}

export interface RsaPublicJwk {
  kty: 'RSA';
  kid: string;
  alg: 'RS256';
  use: 'sig';
  n: string;
  e: string;
}

export function base64url(input: Uint8Array | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : Buffer.from(input);
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64urlDecode(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  return new Uint8Array(Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64'));
}

/**
 * Sign an arbitrary claims object as an RS256 JWT. Header is fixed
 * `{alg:'RS256', typ:'JWT', kid}`. Payload keys are passed through verbatim.
 * Output is the standard three-segment compact form.
 */
export async function signJwtRs256(
  signer: JwtSigner,
  payload: Record<string, unknown>,
): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT', kid: signer.kid };
  const headerSeg = base64url(JSON.stringify(header));
  const payloadSeg = base64url(JSON.stringify(payload));
  const signingInput = `${headerSeg}.${payloadSeg}`;
  const sig = await signer.sign(Buffer.from(signingInput, 'utf8'));
  return `${signingInput}.${base64url(sig)}`;
}

/**
 * Verify an RS256 JWT against a JWK. Returns the parsed payload on success,
 * throws on signature failure or malformed input. Used by tests and any
 * federation-side replay safety check.
 */
export function verifyJwtRs256(token: string, jwk: RsaPublicJwk): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('jwt_malformed');
  const [headerSeg, payloadSeg, sigSeg] = parts as [string, string, string];
  const header = JSON.parse(Buffer.from(headerSeg, 'base64url').toString('utf8'));
  if (header.alg !== 'RS256' || header.typ !== 'JWT') throw new Error('jwt_header_invalid');
  if (header.kid !== jwk.kid) throw new Error('jwt_kid_mismatch');
  const publicKey = createPublicKey({ key: jwk as unknown as JsonWebKey, format: 'jwk' });
  const verify = createVerify('RSA-SHA256');
  verify.update(`${headerSeg}.${payloadSeg}`);
  verify.end();
  const sig = Buffer.from(sigSeg, 'base64url');
  if (!verify.verify(publicKey, sig)) throw new Error('jwt_signature_invalid');
  return JSON.parse(Buffer.from(payloadSeg, 'base64url').toString('utf8'));
}

/**
 * Local RS256 signer backed by Node's built-in crypto. Loads a PKCS#8 PEM
 * private key once at construction and signs in-process. Use only in dev
 * and tests — production signing goes through AWS KMS.
 */
export class LocalRs256Signer implements JwtSigner {
  readonly kid: string;
  private readonly privateKey: ReturnType<typeof createPrivateKey>;

  constructor(opts: { kid: string; privateKeyPem: string }) {
    if (!opts.privateKeyPem.includes('PRIVATE KEY')) {
      throw new Error('LocalRs256Signer: expected PEM-encoded private key');
    }
    this.kid = opts.kid;
    this.privateKey = createPrivateKey({ key: opts.privateKeyPem, format: 'pem' });
  }

  async sign(input: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(nodeSign('RSA-SHA256', Buffer.from(input), this.privateKey));
  }
}

/**
 * Derive the public JWK from a PEM-encoded RSA private key. Used at dev
 * startup to publish a JWKS entry when the operator only supplied the
 * private key (avoids having to keep the public key in env separately).
 */
export function publicJwkFromPrivatePem(opts: {
  kid: string;
  privateKeyPem: string;
}): RsaPublicJwk {
  const privateKey = createPrivateKey({ key: opts.privateKeyPem, format: 'pem' });
  const jwk = privateKey.export({ format: 'jwk' });
  if (jwk.kty !== 'RSA' || typeof jwk.n !== 'string' || typeof jwk.e !== 'string') {
    throw new Error('publicJwkFromPrivatePem: key is not RSA');
  }
  return { kty: 'RSA', kid: opts.kid, alg: 'RS256', use: 'sig', n: jwk.n, e: jwk.e };
}
