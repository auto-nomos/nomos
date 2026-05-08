import { ed25519 } from '@noble/curves/ed25519';

export function signDetached(privateKey: Uint8Array, payload: Uint8Array): Uint8Array {
  if (privateKey.length !== 32) {
    throw new Error(`expected 32-byte ed25519 private key, got ${privateKey.length}`);
  }
  return ed25519.sign(payload, privateKey);
}

export function verifyDetached(
  publicKey: Uint8Array,
  payload: Uint8Array,
  signature: Uint8Array,
): boolean {
  if (publicKey.length !== 32) return false;
  if (signature.length !== 64) return false;
  try {
    return ed25519.verify(signature, payload, publicKey);
  } catch {
    return false;
  }
}
