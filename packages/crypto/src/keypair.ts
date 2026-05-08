import { ed25519 } from '@noble/curves/ed25519';
import { didFromPublicKey } from './did.js';

export interface Keypair {
  did: string;
  privateKey: Uint8Array;
  publicKey: Uint8Array;
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
