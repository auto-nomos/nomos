import { actionsFor, PACKS } from '@auto-nomos/schema-packs';
import { parseUcanJwt } from '@auto-nomos/ucan';

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

const KNOWN_COMMANDS: ReadonlySet<string> = new Set(PACKS.flatMap((pack) => actionsFor(pack.id)));
const KNOWN_INTEGRATIONS: ReadonlySet<string> = new Set(PACKS.map((p) => p.id));

export function isKnownCommand(command: string): boolean {
  if (KNOWN_COMMANDS.has(command)) return true;
  const seg = command.split('/')[1];
  if (!seg) return false;
  return !KNOWN_INTEGRATIONS.has(seg);
}
