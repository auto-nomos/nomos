import { ed25519 } from '@noble/curves/ed25519';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { didFromPublicKey } from './did.js';

export interface Keypair {
  did: string;
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

/** Encode a 32-byte ed25519 private key as 64 hex chars. */
export function privateKeyToHex(privateKey: Uint8Array): string {
  if (privateKey.length !== 32) {
    throw new Error(`expected 32-byte ed25519 private key, got ${privateKey.length}`);
  }
  return bytesToHex(privateKey);
}

/** Decode a 64-hex-char string into a 32-byte ed25519 private key. */
export function privateKeyFromHex(hex: string): Uint8Array {
  if (typeof hex !== 'string' || hex.length !== 64) {
    throw new Error('expected 64-char hex ed25519 private key');
  }
  return hexToBytes(hex);
}

export function generateKeypair(): Keypair {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  const did = didFromPublicKey(publicKey);
  return { did, privateKey, publicKey };
}

export function keypairFromPrivate(privateKey: Uint8Array): Keypair {
  if (privateKey.length !== 32) {
    throw new Error(`expected 32-byte ed25519 private key, got ${privateKey.length}`);
  }
  const publicKey = ed25519.getPublicKey(privateKey);
  const did = didFromPublicKey(publicKey);
  return { did, privateKey, publicKey };
}
