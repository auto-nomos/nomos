export { filesystemPack } from './filesystem/index.js';
export { githubPack } from './github/index.js';
export { googlePack } from './google/index.js';
export { googleCalendarPack } from './google_calendar/index.js';
export { linearPack } from './linear/index.js';
export { notionPack } from './notion/index.js';
export { slackPack } from './slack/index.js';
export { stripePack } from './stripe/index.js';
export * from './types.js';

import { filesystemPack } from './filesystem/index.js';
import { githubPack } from './github/index.js';
import { googlePack } from './google/index.js';
import { googleCalendarPack } from './google_calendar/index.js';
import { linearPack } from './linear/index.js';
import { notionPack } from './notion/index.js';
import { slackPack } from './slack/index.js';
import { stripePack } from './stripe/index.js';
import type { IntegrationId, IntegrationPack, PolicyTemplate } from './types.js';

export const PACKS: IntegrationPack[] = [
  githubPack,
  slackPack,
  googlePack,
  googleCalendarPack,
  notionPack,
  linearPack,
  stripePack,
  filesystemPack,
];

export function listTemplates(): PolicyTemplate[] {
  return PACKS.flatMap((p) => p.templates);
}

export function templatesFor(integrationId: IntegrationId): PolicyTemplate[] {
  return PACKS.find((p) => p.id === integrationId)?.templates ?? [];
}

export function templateById(id: string): PolicyTemplate | undefined {
  return listTemplates().find((t) => t.id === id);
}

export function actionsFor(integrationId: IntegrationId): string[] {
  return PACKS.find((p) => p.id === integrationId)?.actions ?? [];
}

export const KNOWN_COMMANDS: ReadonlySet<string> = new Set(
  PACKS.flatMap((pack) => actionsFor(pack.id)),
);
export const KNOWN_INTEGRATIONS: ReadonlySet<string> = new Set(PACKS.map((p) => p.id));

/**
 * Command admission check used at the PDP edge. Returns true when:
 *   - the exact command is declared by a pack's `actions` (KNOWN_COMMANDS), or
 *   - the integration namespace (first path segment) is NOT one schema-packs
 *     declares — preserves the existing pass-through for arbitrary Cedar action
 *     namespaces in tests and bespoke deployments.
 */
export function isKnownCommand(command: string): boolean {
  if (KNOWN_COMMANDS.has(command)) return true;
  const seg = command.split('/')[1];
  if (!seg) return false;
  return !KNOWN_INTEGRATIONS.has(seg);
}
