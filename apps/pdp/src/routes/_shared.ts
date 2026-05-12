import { parseUcanJwt } from '@auto-nomos/ucan';

export { isKnownCommand } from '@auto-nomos/schema-packs';

export const CUSTOMER_HEADER = 'x-cb-customer';

export function extractAgentId(jwt: string): string | undefined {
  const parsed = parseUcanJwt(jwt);
  if ('error' in parsed) return undefined;
  const meta = parsed.payload.meta as Record<string, unknown> | undefined;
  return typeof meta?.agent_id === 'string' ? meta.agent_id : undefined;
}

export function extractAgentDid(jwt: string): string {
  const parsed = parseUcanJwt(jwt);
  if ('error' in parsed) return 'unknown';
  return parsed.payload.aud;
}
