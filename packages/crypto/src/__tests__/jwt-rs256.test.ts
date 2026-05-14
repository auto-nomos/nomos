import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  base64url,
  base64urlDecode,
  LocalRs256Signer,
  publicJwkFromPrivatePem,
  signJwtRs256,
  verifyJwtRs256,
} from '../jwt-rs256.js';

function generateTestKey() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    privateKeyPem: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    publicKeyPem: publicKey.export({ format: 'pem', type: 'spki' }).toString(),
  };
}

describe('jwt-rs256', () => {
  describe('base64url', () => {
    it('round-trips arbitrary bytes', () => {
      const buf = Buffer.from('hello world');
      const encoded = base64url(buf);
      expect(encoded).not.toContain('=');
      expect(encoded).not.toContain('+');
      expect(encoded).not.toContain('/');
      expect(Buffer.from(base64urlDecode(encoded)).toString('utf8')).toBe('hello world');
    });
  });

  describe('signJwtRs256 + verifyJwtRs256', () => {
    it('round-trips a JWT through sign + verify', async () => {
      const { privateKeyPem } = generateTestKey();
      const signer = new LocalRs256Signer({ kid: 'test-key-1', privateKeyPem });
      const jwk = publicJwkFromPrivatePem({ kid: 'test-key-1', privateKeyPem });

      const token = await signJwtRs256(signer, {
        iss: 'https://id.example.com',
        sub: 'customer/abc/agent/xyz',
        aud: 'api://AzureADTokenExchange',
        iat: 1700000000,
        exp: 1700000300,
      });
      expect(token.split('.')).toHaveLength(3);

      const payload = verifyJwtRs256(token, jwk);
      expect(payload).toMatchObject({
        iss: 'https://id.example.com',
        sub: 'customer/abc/agent/xyz',
        aud: 'api://AzureADTokenExchange',
      });
    });

    it('rejects tokens signed by a different key', async () => {
      const { privateKeyPem: pem1 } = generateTestKey();
      const { privateKeyPem: pem2 } = generateTestKey();
      const signer = new LocalRs256Signer({ kid: 'k1', privateKeyPem: pem1 });
      // Verify against pem2's public JWK but keep the same kid so the header
      // check passes and we hit the signature check.
      const wrongJwk = publicJwkFromPrivatePem({ kid: 'k1', privateKeyPem: pem2 });

      const token = await signJwtRs256(signer, { sub: 'x' });
      expect(() => verifyJwtRs256(token, wrongJwk)).toThrow(/signature_invalid/);
    });

    it('rejects tokens with kid mismatch', async () => {
      const { privateKeyPem } = generateTestKey();
      const signer = new LocalRs256Signer({ kid: 'k1', privateKeyPem });
      const jwk = publicJwkFromPrivatePem({ kid: 'k-other', privateKeyPem });

      const token = await signJwtRs256(signer, { sub: 'x' });
      expect(() => verifyJwtRs256(token, jwk)).toThrow(/kid_mismatch/);
    });

    it('rejects malformed tokens', () => {
      const { privateKeyPem } = generateTestKey();
      const jwk = publicJwkFromPrivatePem({ kid: 'k1', privateKeyPem });
      expect(() => verifyJwtRs256('not.a.jwt.extra', jwk)).toThrow(/malformed/);
      expect(() => verifyJwtRs256('only.two', jwk)).toThrow(/malformed/);
    });
  });

  describe('LocalRs256Signer constructor', () => {
    it('rejects non-PEM input', () => {
      expect(() => new LocalRs256Signer({ kid: 'k', privateKeyPem: 'not-a-pem' })).toThrow(
        /expected PEM/,
      );
    });
  });
});
