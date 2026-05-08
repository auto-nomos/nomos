import { z } from 'zod';

const DID_REGEX = /^did:[a-z0-9]+:[A-Za-z0-9._:-]+$/;
const DID_KEY_REGEX = /^did:key:z[1-9A-HJ-NP-Za-km-z]+$/;

export const Did = z.string().regex(DID_REGEX, 'invalid DID format');
export const DidKey = z.string().regex(DID_KEY_REGEX, 'invalid did:key format');

export type Did = z.infer<typeof Did>;
export type DidKey = z.infer<typeof DidKey>;

export { DID_KEY_REGEX, DID_REGEX };
