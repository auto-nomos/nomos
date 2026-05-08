export function bytesToBase64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

export function base64urlToBytes(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, 'base64url'));
}

export function stringToBase64url(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64url');
}

export function base64urlToString(s: string): string {
  return Buffer.from(s, 'base64url').toString('utf8');
}
