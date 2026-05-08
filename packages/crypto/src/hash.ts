import { sha256 as nobleSha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';

const encoder = new TextEncoder();

function toBytes(input: Uint8Array | string): Uint8Array {
  return typeof input === 'string' ? encoder.encode(input) : input;
}

export function sha256(input: Uint8Array | string): Uint8Array {
  return nobleSha256(toBytes(input));
}

export function sha256Hex(input: Uint8Array | string): string {
  return bytesToHex(sha256(input));
}
